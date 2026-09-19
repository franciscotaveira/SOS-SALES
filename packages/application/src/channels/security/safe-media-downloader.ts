import crypto from "node:crypto";
import type { Writable } from "node:stream";
import {
  safeFetchWithSsrfGuard,
  detectMediaType,
  type ValidatedMediaType,
  type SsrfGuardOptions,
} from "./ssrf-guard";

export interface SafeMediaDownloadOptions extends SsrfGuardOptions {
  /**
   * Maximum allowed media payload size in bytes. Default: 16 MB (16 * 1024 * 1024).
   */
  readonly maxSizeBytes?: number;
  /**
   * Custom allowlist of MIME types. When omitted, defaults to standard WhatsApp media types.
   */
  readonly allowedMimeTypes?: string[];
}

export interface SafeMediaDownloadResult {
  readonly mimeType: string;
  readonly mediaType: ValidatedMediaType;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly buffer: Buffer;
}

export interface SafeMediaStreamSummary {
  readonly mimeType: string;
  readonly mediaType: ValidatedMediaType;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export const DEFAULT_ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  // Audio
  "audio/ogg",
  "audio/opus",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/amr",
  "audio/wav",
  "audio/x-wav",
  // Video
  "video/mp4",
  "video/3gpp",
  "video/quicktime",
  "video/webm",
  // Documents
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/octet-stream",
]);

/**
 * Maps MIME type and/or URL to canonical ValidatedMediaType.
 */
export function detectMediaTypeFromMime(mimeType: string, urlStr?: string): ValidatedMediaType {
  const lowerMime = mimeType.toLowerCase().trim();
  if (lowerMime.startsWith("image/")) return "image";
  if (lowerMime.startsWith("audio/")) return "audio";
  if (lowerMime.startsWith("video/")) return "video";
  if (
    lowerMime.startsWith("application/pdf") ||
    lowerMime.startsWith("text/") ||
    lowerMime.includes("word") ||
    lowerMime.includes("excel") ||
    lowerMime.includes("document") ||
    lowerMime.includes("sheet")
  ) {
    return "document";
  }
  if (urlStr) {
    return detectMediaType(urlStr);
  }
  return "document";
}

/**
 * Inspects initial bytes (magic bytes / file signature) of downloaded media to
 * detect dangerous binaries (Windows PE, Linux ELF), HTML/scripts, or MIME-type spoofing.
 */
export function verifyMediaMagicBytes(firstChunk: Buffer, declaredMimeType: string): void {
  if (firstChunk.length < 4) {
    return;
  }

  // 1. Unconditionally block dangerous executable and script signatures
  // Windows PE Executable (MZ)
  if (firstChunk[0] === 0x4d && firstChunk[1] === 0x5a) {
    throw new Error("DANGEROUS_MEDIA_TYPE_BLOCKED: Executable binary (Windows PE / MZ) detected");
  }
  // Linux ELF Executable (\x7fELF)
  if (
    firstChunk[0] === 0x7f &&
    firstChunk[1] === 0x45 &&
    firstChunk[2] === 0x4c &&
    firstChunk[3] === 0x46
  ) {
    throw new Error("DANGEROUS_MEDIA_TYPE_BLOCKED: Executable binary (Linux ELF) detected");
  }
  // Scripts and HTML documents
  const firstChars = firstChunk.subarray(0, 64).toString("utf-8").toLowerCase().trim();
  if (
    firstChars.startsWith("#!") ||
    firstChars.startsWith("<!doctype html") ||
    firstChars.startsWith("<html") ||
    firstChars.startsWith("<script") ||
    (firstChars.startsWith("<?xml") && firstChars.includes("<script"))
  ) {
    throw new Error("DANGEROUS_MEDIA_TYPE_BLOCKED: Script or HTML content detected in media payload");
  }

  const normMime = declaredMimeType.toLowerCase().trim();

  // 2. Validate specific media file signatures against declared MIME type
  // JPEG: 0xFF 0xD8 0xFF
  if (normMime === "image/jpeg" || normMime === "image/jpg") {
    if (firstChunk[0] !== 0xff || firstChunk[1] !== 0xd8 || firstChunk[2] !== 0xff) {
      throw new Error(
        `INVALID_MEDIA_SIGNATURE: File header does not match declared MIME type '${declaredMimeType}' (expected JPEG FF D8 FF)`
      );
    }
    return;
  }

  // PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (normMime === "image/png") {
    if (
      firstChunk.length >= 8 &&
      (firstChunk[0] !== 0x89 ||
        firstChunk[1] !== 0x50 ||
        firstChunk[2] !== 0x4e ||
        firstChunk[3] !== 0x47 ||
        firstChunk[4] !== 0x0d ||
        firstChunk[5] !== 0x0a ||
        firstChunk[6] !== 0x1a ||
        firstChunk[7] !== 0x0a)
    ) {
      throw new Error(
        `INVALID_MEDIA_SIGNATURE: File header does not match declared MIME type '${declaredMimeType}' (expected PNG header)`
      );
    }
    return;
  }

  // GIF: GIF87a or GIF89a
  if (normMime === "image/gif") {
    const gifHeader = firstChunk.subarray(0, 6).toString("ascii");
    if (gifHeader !== "GIF87a" && gifHeader !== "GIF89a") {
      throw new Error(
        `INVALID_MEDIA_SIGNATURE: File header does not match declared MIME type '${declaredMimeType}' (expected GIF87a/GIF89a)`
      );
    }
    return;
  }

  // WEBP: RIFF....WEBP
  if (normMime === "image/webp") {
    if (firstChunk.length >= 12) {
      const riff = firstChunk.subarray(0, 4).toString("ascii");
      const webp = firstChunk.subarray(8, 12).toString("ascii");
      if (riff !== "RIFF" || webp !== "WEBP") {
        throw new Error(
          `INVALID_MEDIA_SIGNATURE: File header does not match declared MIME type '${declaredMimeType}' (expected RIFF....WEBP)`
        );
      }
    }
    return;
  }

  // PDF: %PDF-
  if (normMime === "application/pdf") {
    const pdfHeader = firstChunk.subarray(0, 5).toString("ascii");
    if (!pdfHeader.startsWith("%PDF")) {
      throw new Error(
        `INVALID_MEDIA_SIGNATURE: File header does not match declared MIME type '${declaredMimeType}' (expected %PDF header)`
      );
    }
    return;
  }

  // OGG: OggS
  if (normMime === "audio/ogg" || normMime === "audio/opus") {
    const oggHeader = firstChunk.subarray(0, 4).toString("ascii");
    if (oggHeader !== "OggS") {
      throw new Error(
        `INVALID_MEDIA_SIGNATURE: File header does not match declared MIME type '${declaredMimeType}' (expected OggS header)`
      );
    }
    return;
  }

  // MP4: ....ftyp
  if (normMime === "video/mp4" || normMime === "audio/mp4") {
    if (firstChunk.length >= 8) {
      const ftyp = firstChunk.subarray(4, 8).toString("ascii");
      if (ftyp !== "ftyp") {
        throw new Error(
          `INVALID_MEDIA_SIGNATURE: File header does not match declared MIME type '${declaredMimeType}' (expected ftyp box)`
        );
      }
    }
    return;
  }

  // MP3: ID3 or MPEG sync frame (0xFF with 0xFB, 0xF3, or 0xF2)
  if (normMime === "audio/mpeg" || normMime === "audio/mp3") {
    const hasId3 = firstChunk.subarray(0, 3).toString("ascii") === "ID3";
    const hasSync =
      firstChunk[0] === 0xff &&
      (firstChunk[1] === 0xfb || firstChunk[1] === 0xf3 || firstChunk[1] === 0xf2);
    if (!hasId3 && !hasSync) {
      throw new Error(
        `INVALID_MEDIA_SIGNATURE: File header does not match declared MIME type '${declaredMimeType}' (expected ID3 or MP3 sync frame)`
      );
    }
    return;
  }
}

/**
 * Downloads a media resource into memory buffer with SSRF protection, strict size capping,
 * MIME type allowlist, magic bytes verification, and SHA-256 computation.
 */
export async function downloadMediaStream(
  url: string,
  options: SafeMediaDownloadOptions = {}
): Promise<SafeMediaDownloadResult> {
  const maxSizeBytes = options.maxSizeBytes ?? 16 * 1024 * 1024;
  const allowedMimes = options.allowedMimeTypes ?? Array.from(DEFAULT_ALLOWED_MIME_TYPES);

  // 1. Fetch via SSRF guard with redirect verification and timeout
  const response = await safeFetchWithSsrfGuard(url, {}, options);
  if (!response.ok) {
    throw new Error(
      `MEDIA_DOWNLOAD_HTTP_ERROR: Remote server returned HTTP ${response.status} (${response.statusText})`
    );
  }

  // 2. Pre-check Content-Length header to fail fast on oversized payloads
  const clHeader = response.headers.get("content-length");
  if (clHeader) {
    const declaredLen = Number.parseInt(clHeader, 10);
    if (!Number.isNaN(declaredLen) && declaredLen > maxSizeBytes) {
      throw new Error(
        `MEDIA_SIZE_LIMIT_EXCEEDED: Declared Content-Length ${declaredLen} exceeds limit of ${maxSizeBytes} bytes`
      );
    }
  }

  // 3. Check Content-Type against allowlist
  const rawContentType = response.headers.get("content-type") || "application/octet-stream";
  const mimeType = rawContentType.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  if (!allowedMimes.includes(mimeType)) {
    throw new Error(`INVALID_MIME_TYPE: MIME type '${mimeType}' is not permitted for media download`);
  }

  // 4. Stream consumption with byte counting and immediate cancellation
  if (!response.body) {
    throw new Error("MEDIA_DOWNLOAD_ERROR: Response body is empty");
  }

  const hash = crypto.createHash("sha256");
  const chunks: Buffer[] = [];
  let bytesRead = 0;
  let firstChunkInspected = false;

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.length;
      if (bytesRead > maxSizeBytes) {
        await reader.cancel();
        throw new Error(
          `MEDIA_SIZE_LIMIT_EXCEEDED: Media payload exceeded maximum allowed size of ${maxSizeBytes} bytes`
        );
      }

      const buf = Buffer.from(value);
      hash.update(buf);
      chunks.push(buf);

      if (!firstChunkInspected) {
        firstChunkInspected = true;
        verifyMediaMagicBytes(buf, mimeType);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const fullBuffer = Buffer.concat(chunks, bytesRead);
  const mediaType = detectMediaTypeFromMime(mimeType, url);

  return {
    mimeType,
    mediaType,
    sizeBytes: bytesRead,
    sha256: hash.digest("hex"),
    buffer: fullBuffer,
  };
}

/**
 * Downloads a media resource and pipes chunks directly into a Writable stream (e.g. file stream)
 * with SSRF protection, strict size capping, MIME type allowlist, magic bytes verification,
 * and SHA-256 computation, sparing application memory.
 */
export async function downloadMediaToStream(
  url: string,
  destinationStream: Writable,
  options: SafeMediaDownloadOptions = {}
): Promise<SafeMediaStreamSummary> {
  const maxSizeBytes = options.maxSizeBytes ?? 16 * 1024 * 1024;
  const allowedMimes = options.allowedMimeTypes ?? Array.from(DEFAULT_ALLOWED_MIME_TYPES);

  const response = await safeFetchWithSsrfGuard(url, {}, options);
  if (!response.ok) {
    throw new Error(
      `MEDIA_DOWNLOAD_HTTP_ERROR: Remote server returned HTTP ${response.status} (${response.statusText})`
    );
  }

  const clHeader = response.headers.get("content-length");
  if (clHeader) {
    const declaredLen = Number.parseInt(clHeader, 10);
    if (!Number.isNaN(declaredLen) && declaredLen > maxSizeBytes) {
      throw new Error(
        `MEDIA_SIZE_LIMIT_EXCEEDED: Declared Content-Length ${declaredLen} exceeds limit of ${maxSizeBytes} bytes`
      );
    }
  }

  const rawContentType = response.headers.get("content-type") || "application/octet-stream";
  const mimeType = rawContentType.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  if (!allowedMimes.includes(mimeType)) {
    throw new Error(`INVALID_MIME_TYPE: MIME type '${mimeType}' is not permitted for media download`);
  }

  if (!response.body) {
    throw new Error("MEDIA_DOWNLOAD_ERROR: Response body is empty");
  }

  const hash = crypto.createHash("sha256");
  let bytesRead = 0;
  let firstChunkInspected = false;

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.length;
      if (bytesRead > maxSizeBytes) {
        await reader.cancel();
        throw new Error(
          `MEDIA_SIZE_LIMIT_EXCEEDED: Media payload exceeded maximum allowed size of ${maxSizeBytes} bytes`
        );
      }

      const buf = Buffer.from(value);
      hash.update(buf);
      destinationStream.write(buf);

      if (!firstChunkInspected) {
        firstChunkInspected = true;
        verifyMediaMagicBytes(buf, mimeType);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const mediaType = detectMediaTypeFromMime(mimeType, url);

  return {
    mimeType,
    mediaType,
    sizeBytes: bytesRead,
    sha256: hash.digest("hex"),
  };
}
