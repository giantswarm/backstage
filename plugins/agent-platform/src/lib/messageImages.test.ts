import {
  MESSAGE_IMAGE_MAX_BYTES,
  MESSAGE_IMAGE_MAX_COUNT,
  MESSAGE_IMAGE_MAX_EDGE,
  SESSION_IMAGES_MAX_BYTES,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  imagesUnsupportedReason,
  messageImagesProblem,
  pastedImageName,
  prepareImage,
  toMessageImages,
} from './messageImages';
import {
  bytesOf,
  pngFile,
  TINY_PNG_BASE64 as PNG_BASE64,
} from './__fixtures__/images';

describe('prepareImage', () => {
  it('reads an image into what a message sends and what the composer shows', async () => {
    const prepared = await prepareImage(pngFile(), 'Pasted image.png');

    expect(prepared.kind).toBe('image');
    if (prepared.kind !== 'image') return;
    expect(prepared.image).toMatchObject({
      name: 'shot.png',
      mediaType: 'image/png',
      data: PNG_BASE64,
      byteSize: bytesOf(PNG_BASE64).length,
      previewUrl: `data:image/png;base64,${PNG_BASE64}`,
    });
  });

  it('types an image by its bytes, whatever the file calls itself', async () => {
    const lying = new File([bytesOf(PNG_BASE64)], 'photo.jpg', {
      type: 'image/jpeg',
    });

    const prepared = await prepareImage(lying, 'x');

    expect(prepared.kind === 'image' && prepared.image.mediaType).toBe(
      'image/png',
    );
  });

  it('names a nameless file with the name it is given', async () => {
    const nameless = new File([bytesOf(PNG_BASE64)], '', { type: 'image/png' });

    const prepared = await prepareImage(nameless, 'Pasted image.png');

    expect(prepared.kind === 'image' && prepared.image.name).toBe(
      'Pasted image.png',
    );
  });

  it('refuses a file that is not one of the image types, saying which are', async () => {
    const svg = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"/>'],
      'logo.svg',
      {
        type: 'image/svg+xml',
      },
    );

    expect(await prepareImage(svg, 'x')).toEqual({
      kind: 'refused',
      problem:
        'logo.svg is not an image the agent can take. Attach a PNG, JPEG, GIF or WebP image.',
    });
  });

  it('refuses an image over the cap, saying how to make it fit', async () => {
    const prepared = await prepareImage(
      pngFile('huge.png', MESSAGE_IMAGE_MAX_BYTES + 1),
      'x',
    );

    expect(prepared).toEqual({
      kind: 'refused',
      problem:
        'huge.png is 2.0 MiB; an image can be at most 2 MiB. Crop it, or save it as a JPEG.',
    });
  });

  describe('scaling down', () => {
    const drawImage = jest.fn();
    // jsdom's File: Jest's global Blob is Node's, which jsdom's FileReader refuses.
    let encoded: File | null;

    beforeEach(() => {
      encoded = new File([bytesOf(PNG_BASE64)], '', { type: 'image/png' });
      (globalThis as any).createImageBitmap = jest.fn(async () => ({
        width: 4000,
        height: 1000,
        close: jest.fn(),
      }));
      jest
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockReturnValue({ drawImage } as any);
      jest
        .spyOn(HTMLCanvasElement.prototype, 'toBlob')
        .mockImplementation(callback => callback(encoded));
    });

    afterEach(() => {
      delete (globalThis as any).createImageBitmap;
      jest.restoreAllMocks();
    });

    it('scales an image larger than the longest side down to it, in its own format', async () => {
      const prepared = await prepareImage(pngFile(), 'x');

      expect(drawImage).toHaveBeenCalledWith(
        expect.anything(),
        0,
        0,
        MESSAGE_IMAGE_MAX_EDGE,
        MESSAGE_IMAGE_MAX_EDGE / 4,
      );
      expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        'image/png',
        expect.any(Number),
      );
      expect(prepared.kind).toBe('image');
    });

    it('sends the original when the browser cannot encode the format', async () => {
      encoded = null;

      const prepared = await prepareImage(pngFile(), 'x');

      expect(prepared.kind === 'image' && prepared.image.data).toBe(PNG_BASE64);
    });

    it('refuses an image the browser cannot decode', async () => {
      (globalThis as any).createImageBitmap = jest.fn(async () => {
        throw new Error('broken');
      });

      expect(await prepareImage(pngFile('broken.png'), 'x')).toEqual({
        kind: 'refused',
        problem:
          'broken.png could not be read as an image. Attach a PNG, JPEG, GIF or WebP image.',
      });
    });
  });
});

describe('messageImagesProblem', () => {
  const image = (byteSize: number) => ({ byteSize, name: 'next.png' });

  it('lets an image through that fits every limit', () => {
    expect(messageImagesProblem([image(1000)], image(1000))).toBeUndefined();
  });

  it('stops at the count a message carries', () => {
    expect(
      messageImagesProblem(
        Array.from({ length: MESSAGE_IMAGE_MAX_COUNT }, () => image(1)),
        image(1),
      ),
    ).toBe(
      'A message can carry 4 images. Remove one to attach next.png, or send it with the next message.',
    );
  });

  it('stops at the bytes a message carries', () => {
    expect(
      messageImagesProblem(
        [image(MESSAGE_IMAGE_MAX_BYTES)],
        image(1.5 * 1024 * 1024),
      ),
    ).toBe(
      'With next.png, the images come to 3.5 MiB; a message can carry 3 MiB. Send it with the next message.',
    );
  });

  it('stops at the bytes a session carries', () => {
    expect(
      messageImagesProblem(
        [],
        image(1024 * 1024),
        SESSION_IMAGES_MAX_BYTES - 1024,
      ),
    ).toMatch(
      /^This session already carries 16\.0 MiB of images, .* Start a new session to send more images\.$/,
    );
  });
});

describe('imagesUnsupportedReason', () => {
  it('names the Claude Code and Codex runtimes, which take text only', () => {
    expect(
      imagesUnsupportedReason({ name: 'Coder', harnessRuntime: 'claude' }),
    ).toBe(
      'Coder cannot take images: its Claude Code runtime accepts text only.',
    );
    expect(
      imagesUnsupportedReason({ name: 'Coder', harnessRuntime: 'codex' }),
    ).toBe('Coder cannot take images: its Codex runtime accepts text only.');
  });

  it('names an Ollama model, which kagent sends no images', () => {
    expect(
      imagesUnsupportedReason({
        name: 'Local',
        harnessRuntime: 'kagent',
        modelProvider: 'Ollama',
      }),
    ).toBe(
      'Local cannot take images: kagent does not pass images to Ollama models.',
    );
  });

  it.each([
    [
      'the Go ADK runtime on Anthropic',
      { harnessRuntime: 'kagent', modelProvider: 'Anthropic' },
    ],
    ['an OpenAI-compatible model', { modelProvider: 'OpenAI' }],
    ['a runtime not read yet', {}],
  ] as const)('says nothing for %s', (_, row) => {
    expect(imagesUnsupportedReason({ name: 'A', ...row })).toBeUndefined();
  });

  it('says nothing without an agent', () => {
    expect(imagesUnsupportedReason(undefined)).toBeUndefined();
  });
});

describe('toMessageImages', () => {
  it('sends only the type, the bytes and the name', () => {
    expect(
      toMessageImages([
        {
          id: 'image-1',
          name: 'a.png',
          mediaType: 'image/png',
          data: PNG_BASE64,
          byteSize: 70,
          previewUrl: 'data:…',
        },
      ]),
    ).toEqual([{ mediaType: 'image/png', data: PNG_BASE64, name: 'a.png' }]);
  });
});

describe('pastedImageName', () => {
  it('numbers the images of one paste after the first', () => {
    expect(pastedImageName('image/png', 0)).toBe('Pasted image.png');
    expect(pastedImageName('image/jpeg', 1)).toBe('Pasted image 2.jpg');
    expect(pastedImageName('', 0)).toBe('Pasted image.png');
  });
});
