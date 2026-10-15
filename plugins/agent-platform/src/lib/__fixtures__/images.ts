/** A real 1×1 PNG, base64. */
export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

/**
 * A file whose bytes are {@link TINY_PNG_BASE64}'s, or start like them and
 * are padded to `size`.
 */
export function pngFile(name = 'shot.png', size?: number): File {
  const head = bytesOf(TINY_PNG_BASE64);
  const bytes = new Uint8Array(size ?? head.length);
  bytes.set(head.subarray(0, Math.min(head.length, bytes.length)));
  return new File([bytes], name, { type: 'image/png' });
}
