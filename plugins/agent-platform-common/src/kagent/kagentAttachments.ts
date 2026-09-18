import { A2aPartWire } from './kagentTaskSchema';

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
  /** The payload as standard base64, when the part carried bytes. */
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
 * something to hand the browser as one string in the page's own DOM. The cap is
 * applied to the *encoded* length, so it is enforced without decoding anything.
 */
export const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;

/**
 * Bytes needed to recognise every type in the allowlist.
 *
 * WebP is the longest signature: `RIFF` + 4 size bytes + `WEBP` = 12. 18 rounds
 * that up to a whole number of base64 quanta with room to spare, and it is the
 * only part of the payload that is ever decoded to classify it — a 5 MB image is
 * never decoded just to find out what it is.
 */
export const SNIFF_BYTES = 18;

/** Why an attachment has no preview. */
export type NoPreviewReason =
  /** The bytes are not a type we render inline — including SVG, always. */
  | 'not-previewable'
  /** The payload is not valid base64, so there are no bytes to look at. */
  | 'undecodable'
  /** Valid base64, but larger than {@link MAX_PREVIEW_BYTES}. */
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
    }
  | { kind: 'none'; reason: NoPreviewReason };

/** Standard base64, padded, with nothing else in it. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

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
  return {
    ...(asNonEmptyString(record.name) === undefined
      ? {}
      : { name: asNonEmptyString(record.name) }),
    ...(asNonEmptyString(record.mimeType) === undefined
      ? {}
      : { declaredType: asNonEmptyString(record.mimeType) }),
    ...(base64 === undefined ? {} : { base64 }),
    ...(uri === undefined ? {} : { uri }),
  };
}

/**
 * Decide whether an attachment may be shown, and as what.
 *
 * The order is deliberate, and each step is a reason not to do the next one:
 * reject a part with no payload, refuse a remote one, validate the base64,
 * apply the size cap, and only then decode the first {@link SNIFF_BYTES} bytes
 * to derive the type. Nothing outside {@link PREVIEWABLE_IMAGE_TYPES} is
 * rendered, and the type used for the `data:` URL is the sniffed one, so the
 * browser is never told a type the bytes do not support.
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

  const base64 = attachment.base64;
  if (!BASE64_PATTERN.test(base64) || base64.length % 4 !== 0) {
    return { kind: 'none', reason: 'undecodable' };
  }
  if (decodedLength(base64) > MAX_PREVIEW_BYTES) {
    return { kind: 'none', reason: 'too-large' };
  }

  const head = decodeHead(base64);
  if (!head) {
    return { kind: 'none', reason: 'undecodable' };
  }
  const type = sniffImageType(head);
  if (!type) {
    return { kind: 'none', reason: 'not-previewable' };
  }
  return { kind: 'image', type, dataUrl: `data:${type};base64,${base64}` };
}

/**
 * The decoded size of a base64 payload, from its length alone.
 *
 * Exact for the padded, unbroken base64 the pattern above has already accepted.
 */
export function decodedLength(base64: string): number {
  let padding = 0;
  if (base64.endsWith('==')) {
    padding = 2;
  } else if (base64.endsWith('=')) {
    padding = 1;
  }
  return (base64.length / 4) * 3 - padding;
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
  // way, and the fourth byte distinguishes a JPEG from a stray `FF D8`.
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

/**
 * The first {@link SNIFF_BYTES} bytes of a base64 payload.
 *
 * Only whole base64 quanta are taken, so the decode can never depend on the
 * trailing bits of a partial group. Returns undefined when the payload is too
 * short to identify or cannot be decoded at all.
 */
function decodeHead(base64: string): Uint8Array | undefined {
  const quanta = Math.ceil(SNIFF_BYTES / 3);
  const head = base64.slice(0, quanta * 4);
  try {
    const binary = globalThis.atob(head);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    // `atob` is the last word on whether this is base64: the pattern above
    // accepts some strings it rejects, and neither is a payload to render.
    return undefined;
  }
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

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}
