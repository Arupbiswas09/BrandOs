import "server-only";

/*
 * What people may upload to an asset. Anything not listed here is refused,
 * so executables, scripts and web pages never land in storage.
 *
 * The file's extension decides its type; the browser's claimed MIME type
 * has to agree (or be blank / generic). The type we store comes from this
 * list, never from the browser, so a file cannot pretend to be something
 * else when it is served back.
 */
const TYPES: Record<string, string> = {
  // Images. SVG is stored but always downloads (it can carry script).
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  heic: "image/heic", heif: "image/heif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp", ico: "image/x-icon", svg: "image/svg+xml",
  psd: "image/vnd.adobe.photoshop", ai: "application/postscript", eps: "application/postscript",
  // Documents
  pdf: "application/pdf", txt: "text/plain", md: "text/markdown", csv: "text/csv", rtf: "application/rtf",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", odp: "application/vnd.oasis.opendocument.presentation",
  key: "application/vnd.apple.keynote", pages: "application/vnd.apple.pages", numbers: "application/vnd.apple.numbers",
  // Fonts
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  // Archives
  zip: "application/zip",
  // Video
  mp4: "video/mp4", m4v: "video/x-m4v", mov: "video/quicktime", webm: "video/webm", avi: "video/x-msvideo", mkv: "video/x-matroska",
  // Audio
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", flac: "audio/flac",
};

/** Browser MIME types that say nothing useful; we go by the extension instead. */
const GENERIC = new Set(["", "application/octet-stream", "binary/octet-stream", "application/x-zip-compressed", "application/zip-compressed"]);

/** Other names browsers and systems use for the same types. */
const ALIASES: Record<string, string[]> = {
  "image/jpeg": ["image/jpg", "image/pjpeg"],
  "image/x-icon": ["image/vnd.microsoft.icon"],
  "image/bmp": ["image/x-ms-bmp"],
  "image/vnd.adobe.photoshop": ["application/x-photoshop", "application/photoshop", "image/x-photoshop"],
  "application/postscript": ["application/illustrator", "application/pdf", "image/x-eps", "application/eps"],
  "text/markdown": ["text/x-markdown", "text/plain"],
  "text/csv": ["application/csv", "text/x-csv", "application/vnd.ms-excel", "text/plain"],
  "application/rtf": ["text/rtf"],
  "font/woff": ["application/font-woff", "application/x-font-woff"],
  "font/woff2": ["application/font-woff2"],
  "font/ttf": ["application/x-font-ttf", "application/font-sfnt", "font/sfnt", "application/x-font-truetype"],
  "font/otf": ["application/x-font-otf", "application/font-sfnt", "font/sfnt", "application/vnd.ms-opentype", "application/x-font-opentype"],
  "application/zip": ["application/x-zip"],
  "audio/wav": ["audio/x-wav", "audio/wave", "audio/vnd.wave"],
  "audio/mp4": ["audio/x-m4a", "audio/m4a"],
  "audio/mpeg": ["audio/mp3"],
  "audio/aac": ["audio/x-aac"],
  "audio/flac": ["audio/x-flac"],
  "video/x-matroska": ["video/mkv"],
  "application/vnd.apple.keynote": ["application/x-iwork-keynote-sffkey"],
  "application/vnd.apple.pages": ["application/x-iwork-pages-sffpages"],
  "application/vnd.apple.numbers": ["application/x-iwork-numbers-sffnumbers"],
};

/** Extensions that run code somewhere. Refused with a clearer message than "not accepted". */
const DANGEROUS = new Set([
  "exe", "msi", "msix", "dll", "com", "scr", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "mjs", "cjs", "jse", "wsf", "wsh", "hta",
  "sh", "bash", "zsh", "command", "app", "dmg", "pkg", "deb", "rpm", "apk", "jar", "py", "rb", "pl", "php", "cgi", "asp", "aspx", "jsp",
  "html", "htm", "xhtml", "shtml", "svgz", "xml", "lnk", "reg", "iso", "docm", "xlsm", "pptm", "dotm", "xltm", "potm",
]);

export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB);
  return (Number.isFinite(mb) && mb > 0 ? Math.min(mb, 2048) : 25) * 1024 * 1024;
}

export function maxUploadLabel(): string {
  return `${Math.round(maxUploadBytes() / 1024 / 1024)} MB`;
}

/** The type to store for this file, or the reason it is refused. */
export function checkUpload(name: string, claimed: string): { ok: true; type: string } | { ok: false; error: string } {
  const parts = name.toLowerCase().trim().split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1] : "";
  // Only the last extension counts: it decides how the file opens ("invoice.pdf.exe" is an .exe).
  if (DANGEROUS.has(ext)) {
    return { ok: false, error: `${name} looks like a program, script or web page. Those cannot be uploaded; zip it or share a link instead.` };
  }
  const type = TYPES[ext];
  if (!type) {
    return { ok: false, error: `${name} is not a file type BrandOS accepts. Upload images, PDFs, Office documents, fonts, zip files, video, audio or text/CSV.` };
  }
  const mime = claimed.toLowerCase().split(";")[0].trim();
  if (!GENERIC.has(mime) && mime !== type && !ALIASES[type]?.includes(mime)) {
    return { ok: false, error: `${name} says it is a .${ext} file but its contents are marked as ${mime}. Save it again in the right format and retry.` };
  }
  return { ok: true, type };
}
