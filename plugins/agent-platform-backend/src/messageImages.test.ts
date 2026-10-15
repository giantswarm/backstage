import {
  MESSAGE_IMAGE_MAX_BYTES,
  MESSAGE_IMAGES_MAX_TOTAL_BYTES,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { readMessageImages } from './messageImages';

/** One byte more than the per-message cap leaves after a full-size image. */
const OVER_TOTAL_REMAINDER =
  MESSAGE_IMAGES_MAX_TOTAL_BYTES - MESSAGE_IMAGE_MAX_BYTES + 1;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff, 0xe0];

/** Bytes that start like the given type, padded to `size`. */
function imageBytes(signature: number[], size = 64): Buffer {
  const bytes = Buffer.alloc(size);
  Buffer.from(signature).copy(bytes);
  return bytes;
}

function png(size?: number) {
  return {
    mediaType: 'image/png',
    data: imageBytes(PNG_SIGNATURE, size).toString('base64'),
  };
}

describe('readMessageImages', () => {
  it('reads no images from a body without any', () => {
    expect(readMessageImages(undefined)).toEqual([]);
  });

  it('decodes each image and keeps its type and trimmed name', () => {
    const [image] = readMessageImages([{ ...png(), name: '  shot.png ' }]);

    expect(image.mediaType).toBe('image/png');
    expect(image.name).toBe('shot.png');
    expect(Array.from(image.bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE);
    expect(image.bytes).toHaveLength(64);
  });

  it('accepts unpadded and URL-safe base64', () => {
    const data = imageBytes(PNG_SIGNATURE, 65)
      .toString('base64url')
      .replace(/=+$/, '');

    expect(
      readMessageImages([{ mediaType: 'image/png', data }])[0].bytes,
    ).toHaveLength(65);
  });

  it.each([
    ['not an array', {}],
    ['five images', [png(), png(), png(), png(), png()]],
    ['an entry that is not an object', ['x']],
    ['an SVG', [{ mediaType: 'image/svg+xml', data: 'PHN2Zz4=' }]],
    ['a type no message takes', [{ ...png(), mediaType: 'image/bmp' }]],
    ['data that is not a string', [{ ...png(), data: 42 }]],
    ['data that is not base64', [{ ...png(), data: 'not base64!' }]],
    ['empty data', [{ ...png(), data: '' }]],
    [
      'bytes that are not the declared type',
      [
        {
          mediaType: 'image/png',
          data: imageBytes(JPEG_SIGNATURE).toString('base64'),
        },
      ],
    ],
    ['a name that is not a string', [{ ...png(), name: 7 }]],
    ['an image over the per-image cap', [png(MESSAGE_IMAGE_MAX_BYTES + 1)]],
    [
      'images over the per-message cap',
      [png(MESSAGE_IMAGE_MAX_BYTES), png(OVER_TOTAL_REMAINDER)],
    ],
  ])('refuses %s', (_, raw) => {
    expect(() => readMessageImages(raw)).toThrow(
      expect.objectContaining({ name: 'InputError' }),
    );
  });

  it('accepts images up to the per-message cap in all', () => {
    expect(
      readMessageImages([
        png(MESSAGE_IMAGE_MAX_BYTES),
        png(MESSAGE_IMAGES_MAX_TOTAL_BYTES - MESSAGE_IMAGE_MAX_BYTES),
      ]),
    ).toHaveLength(2);
  });
});
