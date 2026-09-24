/*
 * How much people may upload, set by admins in Team and access → Limits.
 * Pure so the browser can check a file before sending it and the server
 * can enforce the same rules.
 */

export type FileKind = "image" | "video" | "audio" | "document" | "design" | "font" | "archive";

export const FILE_KINDS: { kind: FileKind; label: string; examples: string }[] = [
  { kind: "image", label: "Images", examples: "PNG, JPG, WebP, GIF, SVG" },
  { kind: "video", label: "Video", examples: "MP4, MOV, WebM" },
  { kind: "audio", label: "Audio", examples: "MP3, WAV, M4A" },
  { kind: "document", label: "Documents", examples: "PDF, Word, Excel, PowerPoint, CSV" },
  { kind: "design", label: "Design files", examples: "PSD, AI, EPS, TIFF" },
  { kind: "font", label: "Fonts", examples: "WOFF2, OTF, TTF" },
  { kind: "archive", label: "Zip files", examples: "ZIP" },
];

const EXT_KIND: Record<string, FileKind> = {};
const add = (kind: FileKind, exts: string) => exts.split(" ").forEach((e) => (EXT_KIND[e] = kind));
add("image", "png jpg jpeg gif webp avif heic heif bmp ico svg");
add("design", "psd ai eps tif tiff");
add("video", "mp4 m4v mov webm avi mkv");
add("audio", "mp3 wav m4a aac ogg flac");
add("document", "pdf txt md csv rtf doc docx xls xlsx ppt pptx odt ods odp key pages numbers");
add("font", "woff woff2 ttf otf");
add("archive", "zip");

export function kindOf(name: string): FileKind | null {
  const parts = name.toLowerCase().trim().split(".");
  return parts.length > 1 ? EXT_KIND[parts[parts.length - 1]] ?? null : null;
}

export type UploadPolicy = {
  /** Per kind of file: may it be uploaded at all, and how big may one file be. */
  kinds: Record<FileKind, { allowed: boolean; maxMb: number }>;
  /** Files in one upload. */
  maxFiles: number;
  /** Everything stored across the workspace. null = no cap. */
  workspaceQuotaGb: number | null;
  /** What one person may have uploaded in total. null = no cap. */
  personQuotaMb: number | null;
};

export const DEFAULT_POLICY: UploadPolicy = {
  kinds: {
    image: { allowed: true, maxMb: 25 },
    video: { allowed: true, maxMb: 250 },
    audio: { allowed: true, maxMb: 50 },
    document: { allowed: true, maxMb: 50 },
    design: { allowed: true, maxMb: 250 },
    font: { allowed: true, maxMb: 10 },
    archive: { allowed: true, maxMb: 100 },
  },
  maxFiles: 20,
  workspaceQuotaGb: null,
  personQuotaMb: null,
};

/** Stored settings may be partial or from an older version; fill in the gaps. */
export function resolvePolicy(stored: Partial<UploadPolicy> | null | undefined): UploadPolicy {
  const kinds = { ...DEFAULT_POLICY.kinds };
  for (const { kind } of FILE_KINDS) kinds[kind] = { ...kinds[kind], ...(stored?.kinds?.[kind] ?? {}) };
  return {
    kinds,
    maxFiles: stored?.maxFiles ?? DEFAULT_POLICY.maxFiles,
    workspaceQuotaGb: stored?.workspaceQuotaGb === undefined ? DEFAULT_POLICY.workspaceQuotaGb : stored.workspaceQuotaGb,
    personQuotaMb: stored?.personQuotaMb === undefined ? DEFAULT_POLICY.personQuotaMb : stored.personQuotaMb,
  };
}

/** What applies to one person: the workspace rules, tightened or loosened by their own limits. */
export type MyUploadLimits = {
  kinds: Record<FileKind, { allowed: boolean; maxBytes: number }>;
  maxFiles: number;
  /** Bytes this person may still add, or null for no cap. Takes the workspace cap into account. */
  remainingBytes: number | null;
  usedBytes: number;
};

const MB = 1024 * 1024;

export function limitsFor(
  policy: UploadPolicy,
  person: { uploadLimitMb?: number | null; storageQuotaMb?: number | null },
  usage: { workspaceBytes: number; personBytes: number },
  hardCapBytes: number,
): MyUploadLimits {
  const kinds = {} as MyUploadLimits["kinds"];
  for (const { kind } of FILE_KINDS) {
    const k = policy.kinds[kind];
    // A person's own limit can only lower the size, never lift it above the workspace or server cap.
    const mb = person.uploadLimitMb ? Math.min(k.maxMb, person.uploadLimitMb) : k.maxMb;
    kinds[kind] = { allowed: k.allowed, maxBytes: Math.min(mb * MB, hardCapBytes) };
  }
  const caps: number[] = [];
  if (policy.workspaceQuotaGb != null) caps.push(policy.workspaceQuotaGb * 1024 * MB - usage.workspaceBytes);
  const personMb = person.storageQuotaMb ?? policy.personQuotaMb;
  if (personMb != null) caps.push(personMb * MB - usage.personBytes);
  return {
    kinds,
    maxFiles: policy.maxFiles,
    remainingBytes: caps.length ? Math.max(0, Math.min(...caps)) : null,
    usedBytes: usage.personBytes,
  };
}

export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * MB) return `${(bytes / 1024 / MB).toFixed(1)} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "2.1 MB" → bytes, for files stored before sizes were kept as numbers. */
export function parseSize(s: string | undefined): number {
  const m = /^([\d.]+)\s*(B|KB|MB|GB)$/i.exec((s ?? "").trim());
  if (!m) return 0;
  const n = Number(m[1]);
  return Math.round(n * { B: 1, KB: 1024, MB, GB: 1024 * MB }[m[2].toUpperCase() as "B" | "KB" | "MB" | "GB"]);
}

/** Why these files cannot go up, or null if they can. Same wording on both sides. */
export function checkBatch(files: { name: string; size: number }[], my: MyUploadLimits): string | null {
  if (files.length > my.maxFiles) return `That is ${files.length} files. Upload up to ${my.maxFiles} at a time.`;
  for (const f of files) {
    const kind = kindOf(f.name);
    if (!kind) continue; // the type check gives the clearer message
    const k = my.kinds[kind];
    const label = FILE_KINDS.find((x) => x.kind === kind)!.label.toLowerCase();
    if (!k.allowed) return `${f.name}: ${label} cannot be uploaded here. An admin has switched them off.`;
    if (f.size > k.maxBytes) return `${f.name} is ${sizeLabel(f.size)}. The limit for ${label} is ${sizeLabel(k.maxBytes)}.`;
  }
  const total = files.reduce((n, f) => n + f.size, 0);
  if (my.remainingBytes != null && total > my.remainingBytes) {
    return my.remainingBytes <= 0
      ? "Your storage allowance is used up. Delete old files or ask an admin for more room."
      : `These files need ${sizeLabel(total)} but only ${sizeLabel(my.remainingBytes)} of storage is left. Ask an admin for more room.`;
  }
  return null;
}
