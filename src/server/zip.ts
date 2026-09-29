import "server-only";
import * as zlib from "node:zlib";

/*
 * A small store-only (no compression) ZIP writer that streams. Uploaded work is
 * mostly images, video and PDFs that are already compressed, so storing them as
 * they are keeps the CPU idle and lets the download start straight away.
 *
 * Entries whose bytes are already in memory get their CRC and size up front in
 * the local header. Streamed entries (Vercel Blob) set bit 3 and put CRC and
 * size in a data descriptor after the bytes; the central directory always has
 * the real values, which is what unzip tools read.
 */

export type ZipSource = { body: ReadableStream | Uint8Array; size?: number };
export type ZipEntry = {
  /** Path inside the archive. Use zipNames() to make these safe and unique. */
  name: string;
  /** Opened only when the writer reaches this entry. null skips it (for example, missing from storage). */
  open: () => Promise<ZipSource | null>;
};

const MAX32 = 0xffffffff;
const UTF8 = 0x0800;
const DESCRIPTOR = 0x0008;
const VERSION = 20; // 2.0: enough for stored entries with UTF-8 names and data descriptors
const MADE_BY = (3 << 8) | VERSION; // Unix, so the external attributes below are read as file modes
const FILE_MODE = (0o100644 << 16) >>> 0; // a plain, readable file

/* ---------------------------------------------------------------- CRC-32 */

let table: Int32Array | null = null;
function jsCrc32(data: Uint8Array, value = 0): number {
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = (value ^ MAX32) | 0;
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ MAX32) >>> 0;
}

// zlib.crc32 arrived in Node 22.2; the JS table does the same job on anything older.
const nativeCrc32 = (zlib as { crc32?: (data: Uint8Array, value?: number) => number }).crc32;

/** CRC-32 of `data`, continuing from `value` (the result for the bytes before it). */
export function crc32(data: Uint8Array, value = 0): number {
  return typeof nativeCrc32 === "function" ? nativeCrc32(data, value) >>> 0 : jsCrc32(data, value);
}

/* ---------------------------------------------------------------- names */

/**
 * Archive-safe, unique file names: no folders (so nothing can unpack outside
 * the folder it is opened in), no characters Windows refuses, and "name (2).ext"
 * for repeats.
 */
export function zipNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((raw) => {
    let base = raw.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, "_").replace(/^[\s.]+|[\s.]+$/g, "").slice(-180);
    if (!base) base = "file";
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : "";
    let name = base;
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${stem} (${n})${ext}`;
    seen.add(name.toLowerCase());
    return name;
  });
}

/* ---------------------------------------------------------------- records */

/** MS-DOS time and date fields, in local time as zip tools expect. */
function dos(d: Date) {
  const year = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

type Meta = { name: Buffer; flags: number; time: number; date: number; crc: number; size: number };

function localHeader(m: Meta): Buffer {
  const b = Buffer.alloc(30);
  b.writeUInt32LE(0x04034b50, 0);
  b.writeUInt16LE(VERSION, 4);
  b.writeUInt16LE(m.flags, 6);
  b.writeUInt16LE(0, 8); // stored
  b.writeUInt16LE(m.time, 10);
  b.writeUInt16LE(m.date, 12);
  b.writeUInt32LE(m.crc, 14);
  b.writeUInt32LE(m.size, 18); // compressed size = size, nothing is compressed
  b.writeUInt32LE(m.size, 22);
  b.writeUInt16LE(m.name.length, 26);
  b.writeUInt16LE(0, 28);
  return Buffer.concat([b, m.name]);
}

function dataDescriptor(crc: number, size: number): Buffer {
  const b = Buffer.alloc(16);
  b.writeUInt32LE(0x08074b50, 0);
  b.writeUInt32LE(crc, 4);
  b.writeUInt32LE(size, 8);
  b.writeUInt32LE(size, 12);
  return b;
}

function centralHeader(m: Meta, offset: number): Buffer {
  const b = Buffer.alloc(46);
  b.writeUInt32LE(0x02014b50, 0);
  b.writeUInt16LE(MADE_BY, 4);
  b.writeUInt16LE(VERSION, 6);
  b.writeUInt16LE(m.flags, 8);
  b.writeUInt16LE(0, 10);
  b.writeUInt16LE(m.time, 12);
  b.writeUInt16LE(m.date, 14);
  b.writeUInt32LE(m.crc, 16);
  b.writeUInt32LE(m.size, 20);
  b.writeUInt32LE(m.size, 24);
  b.writeUInt16LE(m.name.length, 28);
  b.writeUInt16LE(0, 30); // extra
  b.writeUInt16LE(0, 32); // comment
  b.writeUInt16LE(0, 34); // disk
  b.writeUInt16LE(0, 36); // internal attributes
  b.writeUInt32LE(FILE_MODE, 38);
  b.writeUInt32LE(offset, 42);
  return Buffer.concat([b, m.name]);
}

function endRecord(count: number, size: number, offset: number): Buffer {
  const b = Buffer.alloc(22);
  b.writeUInt32LE(0x06054b50, 0);
  b.writeUInt16LE(0, 4);
  b.writeUInt16LE(0, 6);
  b.writeUInt16LE(count, 8);
  b.writeUInt16LE(count, 10);
  b.writeUInt32LE(size, 12);
  b.writeUInt32LE(offset, 16);
  b.writeUInt16LE(0, 20);
  return b;
}

/* ---------------------------------------------------------------- writer */

/** Rough ceiling for a plain (non-Zip64) archive; callers check before they start streaming. */
export const ZIP_LIMIT_BYTES = MAX32 - 64 * 1024 * 1024;
export const ZIP_MAX_ENTRIES = 0xffff;

async function* chunks(entries: ZipEntry[], when: Date): AsyncGenerator<Uint8Array> {
  const { time, date } = dos(when);
  const central: Buffer[] = [];
  let offset = 0;
  const tooBig = () => new Error("These files are too big to zip together. Download them one at a time.");

  for (const entry of entries.slice(0, ZIP_MAX_ENTRIES)) {
    const src = await entry.open();
    if (!src) continue;
    const start = offset;
    const name = Buffer.from(entry.name, "utf8");

    if (src.body instanceof Uint8Array) {
      const bytes = src.body;
      const m: Meta = { name, flags: UTF8, time, date, crc: crc32(bytes), size: bytes.length };
      if (offset + 30 + name.length + bytes.length > MAX32) throw tooBig();
      const head = localHeader(m);
      yield head;
      yield bytes;
      offset += head.length + bytes.length;
      central.push(centralHeader(m, start));
      continue;
    }

    const m: Meta = { name, flags: UTF8 | DESCRIPTOR, time, date, crc: 0, size: 0 };
    const head = localHeader(m);
    yield head;
    offset += head.length;
    const reader = (src.body as ReadableStream<Uint8Array>).getReader();
    let crc = 0, size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value?.length) continue;
        crc = crc32(value, crc);
        size += value.length;
        if (offset + size > MAX32) throw tooBig();
        yield value;
      }
    } finally {
      // Stops the storage download too if the person cancels half way.
      await reader.cancel().catch(() => {});
    }
    offset += size;
    const tail = dataDescriptor(crc, size);
    yield tail;
    offset += tail.length;
    central.push(centralHeader({ ...m, crc, size }, start));
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) {
    yield c;
    cdSize += c.length;
  }
  if (cdStart + cdSize > MAX32) throw tooBig();
  yield endRecord(central.length, cdSize, cdStart);
}

/** A ZIP archive of `entries`, produced as it is read. Each entry is opened only when it is reached. */
export function zipStream(entries: ZipEntry[], when = new Date()): ReadableStream<Uint8Array> {
  const it = chunks(entries, when);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await it.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (e) {
        controller.error(e);
      }
    },
    async cancel() {
      await it.return(undefined).catch(() => {});
    },
  });
}
