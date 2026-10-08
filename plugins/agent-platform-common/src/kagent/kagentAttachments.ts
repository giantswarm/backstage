import { A2aPartWire } from './kagentTaskSchema';
import { asNonEmptyString } from './values';

/**
 * Attachments are **untrusted input rendered in our own origin**: the bytes come
 * from whoever sent the message, and on a shared agent that is not necessarily
 * the person reading them. Every rule in this module follows from that.
 *
 * The declared `mimeType` is never believed. The type is derived from the bytes
 * themselves, from an allowlist, and anything outside it is described rather
 * than rendered.
 */

/** A file part as it arrives, before anything is decided about it. */
export type KagentAttachment = {
  /** The file name kagent reported, when it reported one. */
  name?: string;
  /** What the sender *said* it is. Shown as a claim; never acted on. */
  declaredType?: string;
  /** The payload as the part carried it, when the part carried bytes. */
  base64?: string;
  /** Where the payload lives, when the part named a location instead. */
  uri?: string;
};

/**
 * The image types that may be rendered inline.
 *
 * Raster formats only, and each one is recognised by its own magic bytes below.
 *
 * **SVG is deliberately absent.** An SVG in `<img src="data:…">` does not
 * execute script — browsers load it in a non-scripting mode — so this is defence
 * in depth: it holds the line if the renderer ever becomes an inline `<svg>`, an
 * `<object>`, or an "open in a new tab", and it keeps SVG's XML-entity and
 * filter denial-of-service surface out of the page. Sniffing rather than
 * trusting `mimeType` is what makes the rule effective: an SVG that calls itself
 * `image/png` never reaches a renderer either.
 */
export const PREVIEWABLE_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export type PreviewableImageType = (typeof PREVIEWABLE_IMAGE_TYPES)[number];

/**
 * The largest payload that may be turned into a `data:` URL.
 *
 * A screenshot pasted into a chat is well under this; a payload above it is not
 * something to hand the browser as one string in the page's own DOM. It is
 * measured from the encoded length, so it is enforced without decoding anything.
 */
export const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;

/**
 * The most pixels an image may declare and still be previewed.
 *
 * The byte cap does not bound the decode: a 100 KB PNG can declare 30000×30000
 * and make the browser allocate gigabytes for every reader of the session. 50
 * megapixels admits a 48 MP phone photo and a 5K screenshot.
 */
export const MAX_PREVIEW_PIXELS = 50_000_000;

/**
 * Bytes decoded from the start of the payload to classify it.
 *
 * Covers every signature in the allowlist and the dimensions of PNG, GIF and
 * WebP, the furthest being WebP's VP8 frame size at bytes 26–29. JPEG keeps its
 * dimensions in a frame header after a variable run of segments, which is
 * walked separately, a few bytes at a time.
 */
export const SNIFF_BYTES = 30;

/** Segments walked in search of a JPEG frame header before giving up. */
const MAX_JPEG_SEGMENTS = 64;

/**
 * The most characters the normalised form of a payload within
 * {@link MAX_PREVIEW_BYTES} can have: padded base64 of that many bytes. A
 * payload with more characters that carry bytes is too large whatever they
 * encode, which is decided by counting them, with nothing normalised or
 * decoded.
 */
const MAX_BASE64_LENGTH = Math.ceil(MAX_PREVIEW_BYTES / 3) * 4;

/**
 * The longest raw payload worth reading at all: {@link MAX_BASE64_LENGTH} with
 * room for the line breaks of wrapped base64. Anything longer is too large
 * whatever it turns out to contain, which is decided from `length` without
 * reading the string.
 */
const MAX_ENCODED_LENGTH = Math.ceil(MAX_BASE64_LENGTH * 1.05);

/** Why an attachment has no preview. */
export type NoPreviewReason =
  /** The bytes are not a type we render inline — including SVG, always. */
  | 'not-previewable'
  /** The payload is not base64, or not the image its signature announced. */
  | 'undecodable'
  /**
   * Larger than {@link MAX_PREVIEW_BYTES}, or declaring more than
   * {@link MAX_PREVIEW_PIXELS}.
   */
  | 'too-large'
  /** The part named a location rather than carrying the bytes. */
  | 'remote'
  /** The part carried neither bytes nor a location. */
  | 'empty';

export type AttachmentPreview =
  | {
      kind: 'image';
      /** The type **sniffed from the bytes**, not the one declared. */
      type: PreviewableImageType;
      /** `data:<type>;base64,<payload>`, built without decoding the payload. */
      dataUrl: string;
      /** Decoded size in bytes. */
      byteSize: number;
    }
  | {
      kind: 'none';
      reason: NoPreviewReason;
      /**
       * Decoded size in bytes, present when the payload is valid base64. For a
       * payload too long to read at all, an estimate from its encoded length.
       */
      byteSize?: number;
    };

/**
 * The file part's contents, or undefined when the part is not a file part.
 *
 * Reads the shape the normalisers produce for both wires: `file.bytes` for a
 * payload, `file.uri` for a location. Like the other part readers here it does
 * not consult `kind` — a part carrying a file is a file part whatever it calls
 * itself.
 */
export function readAttachment(
  part: A2aPartWire,
): KagentAttachment | undefined {
  const file = part.file;
  if (!file || typeof file !== 'object') {
    return undefined;
  }
  const record = file as Record<string, unknown>;
  const base64 = asNonEmptyString(record.bytes);
  const uri = asNonEmptyString(record.uri);
  if (base64 === undefined && uri === undefined) {
    return undefined;
  }
  const name = asNonEmptyString(record.name);
  const declaredType = asNonEmptyString(record.mimeType);
  return {
    ...(name === undefined ? {} : { name }),
    ...(declaredType === undefined ? {} : { declaredType }),
    ...(base64 === undefined ? {} : { base64 }),
    ...(uri === undefined ? {} : { uri }),
  };
}

/**
 * Decide whether an attachment may be shown, and as what.
 *
 * The order is deliberate, and each step is a reason not to do the next one:
 * reject a part with no payload, refuse a remote one, apply the size cap to the
 * raw length and then to the count of characters that carry bytes, normalise
 * and validate the base64, apply the exact size cap, and only then decode the
 * first {@link SNIFF_BYTES} bytes to derive the type and read the dimensions.
 * Nothing outside {@link PREVIEWABLE_IMAGE_TYPES} is rendered, and the type
 * used for the `data:` URL is the sniffed one, so the browser is never told a
 * type the bytes do not support.
 */
export function readAttachmentPreview(
  attachment: KagentAttachment,
): AttachmentPreview {
  if (attachment.base64 === undefined) {
    // A location we could fetch from is still not one we *will* fetch from: the
    // portal would be making a request on the user's behalf to a host named by
    // whoever sent the message.
    return {
      kind: 'none',
      reason: attachment.uri === undefined ? 'empty' : 'remote',
    };
  }
  const raw = attachment.base64;
  if (
    raw.length > MAX_ENCODED_LENGTH ||
    payloadLengthExceeds(raw, MAX_BASE64_LENGTH)
  ) {
    // Not normalised, let alone decoded: the raw length first, then the
    // characters that carry bytes, counted up to the cap and no further. The
    // size is what explains the reason, so it is estimated rather than left
    // out.
    return {
      kind: 'none',
      reason: 'too-large',
      byteSize: Math.floor((raw.length / 4) * 3),
    };
  }

  const base64 = normalizeBase64(raw);
  if (base64 === undefined) {
    return { kind: 'none', reason: 'undecodable' };
  }
  const byteSize = decodedLength(base64);
  if (byteSize > MAX_PREVIEW_BYTES) {
    // The last quantum: {@link MAX_BASE64_LENGTH} characters with no padding
    // among them decode to one byte over the cap.
    return { kind: 'none', reason: 'too-large', byteSize };
  }

  const head = decodeRange(base64, 0, SNIFF_BYTES);
  if (!head) {
    return { kind: 'none', reason: 'undecodable', byteSize };
  }
  const type = sniffImageType(head);
  if (!type) {
    return { kind: 'none', reason: 'not-previewable', byteSize };
  }
  const size = readImageSize(base64, type, head);
  if (!size) {
    return { kind: 'none', reason: 'undecodable', byteSize };
  }
  if (size.width * size.height > MAX_PREVIEW_PIXELS) {
    return { kind: 'none', reason: 'too-large', byteSize };
  }
  return {
    kind: 'image',
    type,
    dataUrl: `data:${type};base64,${base64}`,
    byteSize,
  };
}

const PLUS = '+'.charCodeAt(0);
const SLASH = '/'.charCodeAt(0);
const EQUALS = '='.charCodeAt(0);

/**
 * The payload as padded standard base64, or undefined when it is not base64.
 *
 * Producers differ in what they send for the same bytes: unpadded
 * (`RawStdEncoding`), URL-safe, or wrapped at 76 characters (Python's
 * `base64.encodebytes`). All of them are the same bytes, and a `data:` URL
 * needs the one form.
 *
 * Read with plain loops and never a regular expression: a quantified match
 * keeps backtracking state that grows with the payload, and over ~11 MB the
 * engine can run out of stack for it (a RangeError) — under load, so not every
 * time — before any size cap applied to the result could step in.
 */
export function normalizeBase64(raw: string): string | undefined {
  // What proto3 JSON writes for `bytes`, and so what nearly every payload is:
  // one pass to recognise it, and no copy of a string of up to ~11 MB.
  if (isStandardBase64(raw)) {
    return raw;
  }
  const compact = compactBase64(raw);
  const end = compact.length - trailingPadding(compact);
  if (end === 0 || end % 4 === 1 || !isBase64Alphabet(compact, end)) {
    return undefined;
  }
  return compact.slice(0, end) + '='.repeat((4 - (end % 4)) % 4);
}

/**
 * Padded standard base64, the form a `data:` URL needs: the alphabet, then up
 * to two `=`, in whole quanta.
 */
function isStandardBase64(text: string): boolean {
  const end = text.length - trailingPadding(text);
  return text.length % 4 === 0 && end > 0 && isBase64Alphabet(text, end);
}

/**
 * The payload without its whitespace and in the standard alphabet. Each run
 * between whitespace is sliced out whole, so a wrapped payload costs its lines
 * rather than its characters.
 */
function compactBase64(raw: string): string {
  const runs: string[] = [];
  let start = -1;
  for (let at = 0; at <= raw.length; at += 1) {
    if (at < raw.length && !isWhitespaceAt(raw, at)) {
      if (start < 0) {
        start = at;
      }
    } else if (start >= 0) {
      runs.push(raw.slice(start, at));
      start = -1;
    }
  }
  return runs.join('').replaceAll('-', '+').replaceAll('_', '/');
}

/**
 * Whether more than `limit` characters of the payload carry bytes — every one
 * but whitespace — reading up to the first past the limit and no further.
 */
function payloadLengthExceeds(raw: string, limit: number): boolean {
  let length = 0;
  for (let at = 0; at < raw.length; at += 1) {
    if (!isWhitespaceAt(raw, at)) {
      length += 1;
      if (length > limit) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether the character at `at` is whitespace as `\s` has it, which is also
 * the set `trim` removes. Printable ASCII, where every base64 character lives,
 * is answered from the code alone.
 */
function isWhitespaceAt(text: string, at: number): boolean {
  const code = text.charCodeAt(at);
  if (code > 0x20 && code < 0x7f) {
    return false;
  }
  return text[at].trim() === '';
}

/** Whether every character before `end` is in the standard base64 alphabet. */
function isBase64Alphabet(text: string, end: number): boolean {
  for (let at = 0; at < end; at += 1) {
    const code = text.charCodeAt(at);
    const letter =
      (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
    const digit = code >= 0x30 && code <= 0x39;
    if (!letter && !digit && code !== PLUS && code !== SLASH) {
      return false;
    }
  }
  return true;
}

/** The `=` characters that end the payload, at most the two padding allows. */
function trailingPadding(text: string): number {
  let padding = 0;
  while (
    padding < 2 &&
    padding < text.length &&
    text.charCodeAt(text.length - 1 - padding) === EQUALS
  ) {
    padding += 1;
  }
  return padding;
}

/**
 * The decoded size of a base64 payload, from its length alone.
 *
 * Exact for the padded, unbroken base64 {@link normalizeBase64} produces.
 */
export function decodedLength(base64: string): number {
  return (base64.length / 4) * 3 - trailingPadding(base64);
}

/**
 * The type the bytes themselves say they are, or undefined for anything else.
 *
 * An SVG is "anything else" — by omission, and by the tests that say so.
 */
export function sniffImageType(
  head: Uint8Array,
): PreviewableImageType | undefined {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  // JPEG: SOI plus the first marker. Every variant (JFIF, Exif, raw) starts this
  // way, and the third byte distinguishes a JPEG from a stray `FF D8`.
  if (
    head.length >= 3 &&
    head[0] === 0xff &&
    head[1] === 0xd8 &&
    head[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    startsWith(head, asciiBytes('GIF87a')) ||
    startsWith(head, asciiBytes('GIF89a'))
  ) {
    return 'image/gif';
  }
  // WebP is a RIFF container: `RIFF` + 4 length bytes + `WEBP`. The length bytes
  // are skipped rather than checked — they say how long the file claims to be,
  // which is not what identifies it.
  if (
    startsWith(head, asciiBytes('RIFF')) &&
    startsWith(head.subarray(8), asciiBytes('WEBP'))
  ) {
    return 'image/webp';
  }
  return undefined;
}

type ImageSize = { width: number; height: number };

/**
 * The dimensions the image's own header declares, or undefined when the header
 * is missing, truncated or states a zero side.
 */
function readImageSize(
  base64: string,
  type: PreviewableImageType,
  head: Uint8Array,
): ImageSize | undefined {
  let size: ImageSize | undefined;
  switch (type) {
    case 'image/png':
      // The IHDR chunk is required to come first.
      size = startsWith(head.subarray(12), asciiBytes('IHDR'))
        ? { width: uint32BE(head, 16), height: uint32BE(head, 20) }
        : undefined;
      break;
    case 'image/gif':
      size = { width: uint16LE(head, 6), height: uint16LE(head, 8) };
      break;
    case 'image/webp':
      size = readWebpSize(head);
      break;
    default:
      size = readJpegSize(base64);
  }
  if (
    !size ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    return undefined;
  }
  return size;
}

function readWebpSize(head: Uint8Array): ImageSize | undefined {
  // Lossy: a VP8 key frame, whose start code precedes two 14-bit sides.
  if (startsWith(head.subarray(12), asciiBytes('VP8 '))) {
    if (!startsWith(head.subarray(23), [0x9d, 0x01, 0x2a])) {
      return undefined;
    }
    return {
      width: uint16LE(head, 26) & 0x3fff,
      height: uint16LE(head, 28) & 0x3fff,
    };
  }
  // Lossless: a signature byte, then both sides minus one, 14 bits each.
  if (startsWith(head.subarray(12), asciiBytes('VP8L'))) {
    if (head[20] !== 0x2f) {
      return undefined;
    }
    const bits = uint32LE(head, 21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }
  // Extended: the canvas size, each side minus one in 24 bits.
  if (startsWith(head.subarray(12), asciiBytes('VP8X'))) {
    return { width: uint24LE(head, 24) + 1, height: uint24LE(head, 27) + 1 };
  }
  return undefined;
}

/**
 * A JPEG's dimensions, from its first frame header.
 *
 * Walks the marker segments from the start of the file, decoding only each
 * segment's first few bytes — an Exif block ahead of the frame header can be
 * tens of kilobytes that are never read.
 */
function readJpegSize(base64: string): ImageSize | undefined {
  let offset = 2;
  for (let step = 0; step < MAX_JPEG_SEGMENTS; step += 1) {
    const segment = decodeRange(base64, offset, 9);
    if (!segment || segment.length < 2 || segment[0] !== 0xff) {
      return undefined;
    }
    const marker = segment[1];
    if (marker === 0xff) {
      // A fill byte ahead of the marker.
      offset += 1;
      continue;
    }
    if (isFrameHeader(marker)) {
      return segment.length < 9
        ? undefined
        : { width: uint16BE(segment, 7), height: uint16BE(segment, 5) };
    }
    if (marker === 0xda || marker === 0xd9) {
      // Scan data or the end of the image, with no frame header before it.
      return undefined;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      // Markers that stand alone, with no length.
      offset += 2;
      continue;
    }
    if (segment.length < 4) {
      return undefined;
    }
    offset += 2 + uint16BE(segment, 2);
  }
  return undefined;
}

/** SOF0–SOF15, less the three codes in that range that are not frame headers. */
function isFrameHeader(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

/**
 * `length` bytes of a padded base64 payload from byte `offset`, fewer when the
 * payload ends first.
 *
 * Decodes only the base64 quanta that cover the range, so reading a header
 * never costs the size of the image. Returns undefined when those quanta are
 * not base64.
 */
function decodeRange(
  base64: string,
  offset: number,
  length: number,
): Uint8Array | undefined {
  const first = Math.floor(offset / 3);
  const last = Math.ceil((offset + length) / 3);
  let binary: string;
  try {
    binary = globalThis.atob(base64.slice(first * 4, last * 4));
  } catch {
    return undefined;
  }
  const start = offset - first * 3;
  const bytes = new Uint8Array(
    Math.max(0, Math.min(length, binary.length - start)),
  );
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = binary.charCodeAt(start + i);
  }
  return bytes;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[index] === byte);
}

function asciiBytes(text: string): number[] {
  return [...text].map(character => character.charCodeAt(0));
}

function uint16BE(bytes: Uint8Array, at: number): number {
  return bytes[at] * 0x100 + bytes[at + 1];
}

function uint32BE(bytes: Uint8Array, at: number): number {
  return uint16BE(bytes, at) * 0x10000 + uint16BE(bytes, at + 2);
}

function uint16LE(bytes: Uint8Array, at: number): number {
  return bytes[at] + bytes[at + 1] * 0x100;
}

function uint24LE(bytes: Uint8Array, at: number): number {
  return uint16LE(bytes, at) + bytes[at + 2] * 0x10000;
}

function uint32LE(bytes: Uint8Array, at: number): number {
  return uint24LE(bytes, at) + bytes[at + 3] * 0x1000000;
}
