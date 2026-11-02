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

/**
 * Stands in for the browser's decode and encode, which jsdom has neither of:
 * `createImageBitmap` answers an image of `width` × `height`, and the canvas
 * encodes whatever type is asked to `encode(type)` — by default the tiny PNG's
 * bytes typed as asked. Call `restore` after the test.
 */
export function mockImageEncoding({
  width = 1,
  height = 1,
  encode = (type: string): File | null =>
    new File([bytesOf(TINY_PNG_BASE64)], '', { type }),
}: {
  width?: number;
  height?: number;
  encode?: (type: string) => File | null;
} = {}) {
  const drawImage = jest.fn();
  const global = globalThis as { createImageBitmap?: unknown };
  const original = global.createImageBitmap;
  const createImageBitmap = jest.fn(async () => ({
    width,
    height,
    close: jest.fn(),
  }));
  global.createImageBitmap = createImageBitmap;
  const getContext = jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue({ drawImage } as unknown as RenderingContext);
  const toBlob = jest
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((callback, type) =>
      callback(encode(type ?? 'image/png')),
    );
  return {
    createImageBitmap,
    drawImage,
    toBlob,
    restore: () => {
      global.createImageBitmap = original;
      getContext.mockRestore();
      toBlob.mockRestore();
    },
  };
}
