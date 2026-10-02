import { a2aPartWireSchema } from './kagentTaskSchema';
import {
  decodedLength,
  MAX_PREVIEW_BYTES,
  MAX_PREVIEW_PIXELS,
  readAttachment,
  readAttachmentPreview,
  sniffImageType,
} from './kagentAttachments';
import { attachmentCorruptV099, attachmentPngV2 } from '../testFixtures';

function part(raw: unknown) {
  return a2aPartWireSchema.parse(raw);
}

function filePart(file: Record<string, unknown>) {
  return part({ kind: 'file', file });
}

/** Base64 of the given bytes, followed by enough zeroes to look like a payload. */
function payload(signature: number[], pad = 30): string {
  const bytes = [...signature, ...new Array(pad).fill(0)];
  return Buffer.from(Uint8Array.from(bytes)).toString('base64');
}

const ascii = (text: string) => [...text].map(c => c.charCodeAt(0));
const be16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [...be16(Math.floor(n / 0x10000)), ...be16(n)];
const le16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
const le24 = (n: number) => [...le16(n), (n >>> 16) & 0xff];

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG signature and IHDR chunk declaring the given size. */
function png(width: number, height: number): number[] {
  return [
    ...PNG,
    ...be32(13),
    ...ascii('IHDR'),
    ...be32(width),
    ...be32(height),
  ];
}

/** A JPEG whose frame header follows an APP1 segment, as an Exif photo's does. */
function jpeg(width: number, height: number): number[] {
  return [
    0xff,
    0xd8,
    0xff,
    0xe1,
    ...be16(2 + 20),
    ...new Array(20).fill(0),
    0xff,
    0xc0,
    ...be16(17),
    8,
    ...be16(height),
    ...be16(width),
  ];
}

function gif(width: number, height: number): number[] {
  return [...ascii('GIF89a'), ...le16(width), ...le16(height)];
}

/** An extended-format WebP, whose VP8X chunk carries the canvas size. */
function webp(width: number, height: number): number[] {
  return [
    ...ascii('RIFF'),
    0x24,
    0x00,
    0x00,
    0x00,
    ...ascii('WEBP'),
    ...ascii('VP8X'),
    // Chunk size, then a flags byte and three reserved bytes.
    ...le24(10),
    0,
    0,
    0,
    0,
    0,
    ...le24(width - 1),
    ...le24(height - 1),
  ];
}

const SVG = ascii('<svg xmlns="http://www.w3.org/2000/svg">');

describe('readAttachment', () => {
  it('reads a part that carries bytes', () => {
    expect(
      readAttachment(
        filePart({
          name: 'shot.png',
          mimeType: 'image/png',
          bytes: payload(png(1, 1)),
        }),
      ),
    ).toMatchObject({ name: 'shot.png', declaredType: 'image/png' });
  });

  it('reads a part that names a location instead', () => {
    expect(
      readAttachment(filePart({ uri: 'https://example.test/shot.png' })),
    ).toMatchObject({ uri: 'https://example.test/shot.png' });
  });

  it('is not a file part when it carries neither', () => {
    expect(readAttachment(filePart({ name: 'shot.png' }))).toBeUndefined();
    expect(readAttachment(part({ kind: 'text', text: 'hi' }))).toBeUndefined();
  });
});

describe('readAttachmentPreview', () => {
  it.each([
    ['PNG', png, 'image/png'],
    ['JPEG', jpeg, 'image/jpeg'],
    ['GIF', gif, 'image/gif'],
    ['WebP', webp, 'image/webp'],
  ])('previews a %s from its own bytes', (_name, image, type) => {
    const bytes = payload(image(640, 480));

    expect(readAttachmentPreview({ base64: bytes })).toEqual({
      kind: 'image',
      type,
      dataUrl: `data:${type};base64,${bytes}`,
      byteSize: Buffer.from(bytes, 'base64').length,
    });
  });

  it.each([
    ['PNG', png],
    ['JPEG', jpeg],
    ['GIF', gif],
    ['WebP', webp],
  ])('reads a %s header to hold the pixel budget', (_name, image) => {
    // A pixel flood: a few bytes on the wire, gigabytes once decoded.
    const width = 10_000;
    const height = MAX_PREVIEW_PIXELS / width;

    expect(
      readAttachmentPreview({ base64: payload(image(width, height)) }),
    ).toMatchObject({ kind: 'image' });
    expect(
      readAttachmentPreview({ base64: payload(image(width, height + 1)) }),
    ).toMatchObject({ kind: 'none', reason: 'too-large' });
  });

  it('refuses an image whose header states no size', () => {
    expect(readAttachmentPreview({ base64: payload(PNG) })).toMatchObject({
      kind: 'none',
      reason: 'undecodable',
    });
  });

  it.each([
    ['unpadded', (b: string) => b.replace(/=+$/, '')],
    ['URL-safe', (b: string) => b.replace(/\+/g, '-').replace(/\//g, '_')],
    ['line-wrapped', (b: string) => b.replace(/(.{8})/g, '$1\r\n')],
  ])('previews %s base64 as the same image', (_name, encode) => {
    const standard = payload([...png(3, 2), 0xfb, 0xff], 1);
    expect(standard).toMatch(/[+/=]/);

    expect(readAttachmentPreview({ base64: encode(standard) })).toMatchObject({
      kind: 'image',
      dataUrl: `data:image/png;base64,${standard}`,
    });
  });

  it('never previews an SVG, however it describes itself', () => {
    // The whole reason the type is sniffed rather than believed.
    const preview = readAttachmentPreview({
      declaredType: 'image/png',
      name: 'harmless.png',
      base64: payload(SVG),
    });

    expect(preview).toMatchObject({ kind: 'none', reason: 'not-previewable' });
  });

  it('does not believe a declared type over the bytes in the other direction either', () => {
    // A real PNG that calls itself something else is still previewed, as a PNG.
    expect(
      readAttachmentPreview({
        declaredType: 'application/octet-stream',
        base64: payload(png(1, 1)),
      }),
    ).toMatchObject({ kind: 'image', type: 'image/png' });
  });

  it('refuses a payload that is not base64 at all', () => {
    expect(readAttachmentPreview({ base64: 'not base64!' })).toEqual({
      kind: 'none',
      reason: 'undecodable',
    });
  });

  it('refuses the corrupted bytes kagent 0.9.9 served', () => {
    // Regression fixture: raw binary lossily decoded to UTF-8. Roughly half the
    // bytes are U+FFFD, so the image is unrecoverable — the renderer must say so
    // rather than hand the browser a broken `data:` URL.
    const attachment = readAttachment(part(attachmentCorruptV099.part));

    expect(attachment).toBeDefined();
    expect(readAttachmentPreview(attachment!)).toEqual({
      kind: 'none',
      reason: 'undecodable',
    });
  });

  it('previews the same PNG as kagent API v2 serves it', () => {
    // proto3 JSON encodes the `bytes raw` field as standard base64, so the
    // payload reaches the browser intact on the v2 path.
    const attachment = readAttachment(part(attachmentPngV2.part));

    expect(readAttachmentPreview(attachment!)).toMatchObject({
      kind: 'image',
      type: 'image/png',
    });
  });

  it('refuses a payload past the size cap without decoding it', () => {
    // Four base64 characters per three bytes, so this is one quantum over.
    const oversized = 'A'.repeat((Math.floor(MAX_PREVIEW_BYTES / 3) + 1) * 4);

    expect(readAttachmentPreview({ base64: oversized })).toEqual({
      kind: 'none',
      reason: 'too-large',
      byteSize: MAX_PREVIEW_BYTES + 1,
    });
  });

  it('refuses a payload far past the size cap from its length alone', () => {
    // Not even valid base64: the length decides before the content is read.
    const oversized = '!'.repeat(MAX_PREVIEW_BYTES * 2);

    expect(readAttachmentPreview({ base64: oversized })).toEqual({
      kind: 'none',
      reason: 'too-large',
    });
  });

  it('does not fetch a file kagent only linked to', () => {
    expect(
      readAttachmentPreview({ uri: 'https://example.test/shot.png' }),
    ).toEqual({ kind: 'none', reason: 'remote' });
  });

  it('reports an attachment with no content as such', () => {
    expect(readAttachmentPreview({})).toEqual({
      kind: 'none',
      reason: 'empty',
    });
  });
});

describe('sniffImageType', () => {
  it('needs the whole signature, not its first byte', () => {
    expect(sniffImageType(Uint8Array.from([0x89, 0x50]))).toBeUndefined();
    // `FF D8` alone is not a JPEG either.
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8]))).toBeUndefined();
  });

  it('does not take a RIFF container that is not WebP', () => {
    const wav = [
      ...[...'RIFF'].map(c => c.charCodeAt(0)),
      0,
      0,
      0,
      0,
      ...[...'WAVE'].map(c => c.charCodeAt(0)),
    ];

    expect(sniffImageType(Uint8Array.from(wav))).toBeUndefined();
  });
});

describe('decodedLength', () => {
  it.each([
    ['AAAA', 3],
    ['AAA=', 2],
    ['AA==', 1],
  ])('measures %s without decoding it', (base64, bytes) => {
    expect(decodedLength(base64)).toBe(bytes);
  });
});
