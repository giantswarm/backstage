import {
  MESSAGE_IMAGE_MAX_BYTES,
  MESSAGE_IMAGE_MAX_COUNT,
  MESSAGE_IMAGE_MAX_EDGE,
  SESSION_IMAGES_MAX_BYTES,
  SESSION_IMAGES_MAX_COUNT,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  attachedImagesProblem,
  imagesUnsupportedReason,
  messageImagesProblem,
  prepareImage,
  toMessageImages,
  uniqueImageName,
} from './messageImages';
import {
  bytesOf,
  mockImageEncoding,
  pngFile,
  TINY_PNG_BASE64 as PNG_BASE64,
} from './__fixtures__/images';

const GIF_HEADER = 'R0lGODlhAQABAAAAACw=';

describe('prepareImage', () => {
  let encoding: ReturnType<typeof mockImageEncoding>;
  afterEach(() => encoding?.restore());

  it('draws and encodes every image again, which leaves its metadata behind', async () => {
    encoding = mockImageEncoding({ width: 800, height: 600 });

    const prepared = await prepareImage(pngFile(), 'shot.png');

    // Drawn at its own size: nothing to scale, but still a new encoding.
    expect(encoding.createImageBitmap).toHaveBeenCalledWith(expect.anything(), {
      imageOrientation: 'from-image',
    });
    expect(encoding.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      800,
      600,
    );
    expect(prepared).toEqual({
      kind: 'image',
      image: {
        name: 'shot.png',
        mediaType: 'image/png',
        byteSize: bytesOf(PNG_BASE64).length,
        previewUrl: `data:image/png;base64,${PNG_BASE64}`,
      },
    });
  });

  it('types an image by its bytes, whatever the file calls itself', async () => {
    encoding = mockImageEncoding();
    const lying = new File([bytesOf(PNG_BASE64)], 'photo.jpg', {
      type: 'image/jpeg',
    });

    const prepared = await prepareImage(lying, 'photo.jpg');

    expect(encoding.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/png',
      expect.any(Number),
    );
    expect(prepared.kind === 'image' && prepared.image.name).toBe('photo.png');
  });

  it('gives a name without an extension that of the type it is sent as', async () => {
    encoding = mockImageEncoding();

    const prepared = await prepareImage(pngFile(), 'Pasted image');

    expect(prepared.kind === 'image' && prepared.image.name).toBe(
      'Pasted image.png',
    );
  });

  it('scales an image larger than the longest side down to it', async () => {
    encoding = mockImageEncoding({ width: 4000, height: 1000 });

    await prepareImage(pngFile(), 'wide.png');

    expect(encoding.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      MESSAGE_IMAGE_MAX_EDGE,
      MESSAGE_IMAGE_MAX_EDGE / 4,
    );
  });

  it('sends a GIF as a PNG of its first frame, scaled like any other', async () => {
    encoding = mockImageEncoding({ width: 9000, height: 300 });
    const gif = new File([bytesOf(GIF_HEADER)], 'strip.gif', {
      type: 'image/gif',
    });

    const prepared = await prepareImage(gif, 'strip.gif');

    expect(encoding.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      MESSAGE_IMAGE_MAX_EDGE,
      67,
    );
    expect(prepared.kind === 'image' && prepared.image).toMatchObject({
      name: 'strip.png',
      mediaType: 'image/png',
    });
  });

  it('falls back to PNG where the browser cannot encode the format', async () => {
    encoding = mockImageEncoding({
      encode: type =>
        type === 'image/png'
          ? new File([bytesOf(PNG_BASE64)], '', { type })
          : null,
    });
    const webp = new File(
      [Uint8Array.from('RIFF\0\0\0\0WEBPVP8 ', c => c.charCodeAt(0))],
      'shot.webp',
      { type: 'image/webp' },
    );

    const prepared = await prepareImage(webp, 'shot.webp');

    expect(prepared.kind === 'image' && prepared.image).toMatchObject({
      name: 'shot.png',
      mediaType: 'image/png',
    });
  });

  it('refuses where the browser cannot encode at all, saying what to use', async () => {
    encoding = mockImageEncoding({ encode: () => null });

    expect(await prepareImage(pngFile(), 'shot.png')).toEqual({
      kind: 'refused',
      problem:
        'This browser cannot prepare images for sending. Use a current version of Chrome, Edge, Firefox or Safari.',
    });
  });

  it('refuses an image the browser cannot decode', async () => {
    encoding = mockImageEncoding();
    encoding.createImageBitmap.mockRejectedValueOnce(new Error('broken'));

    expect(await prepareImage(pngFile(), 'broken.png')).toEqual({
      kind: 'refused',
      problem:
        'broken.png could not be read as an image. Attach a PNG, JPEG, GIF or WebP image.',
    });
  });

  it('refuses a file that is not one of the image types, saying which are', async () => {
    encoding = mockImageEncoding();
    const svg = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"/>'],
      'logo.svg',
      { type: 'image/svg+xml' },
    );

    expect(await prepareImage(svg, 'logo.svg')).toEqual({
      kind: 'refused',
      problem:
        'logo.svg is not an image the agent can take. Attach a PNG, JPEG, GIF or WebP image.',
    });
  });

  it('refuses an image still over the cap once encoded, saying how to make it fit', async () => {
    encoding = mockImageEncoding({
      width: 4000,
      height: 3000,
      encode: type =>
        new File([new Uint8Array(MESSAGE_IMAGE_MAX_BYTES + 1)], '', { type }),
    });

    expect(await prepareImage(pngFile(), 'huge.png')).toEqual({
      kind: 'refused',
      problem:
        'huge.png is 2.0 MiB after scaling it down; an image can be at most 2 MiB. Crop it, or save it as a JPEG.',
    });
  });
});

describe('uniqueImageName', () => {
  it('numbers a name already attached, before its extension', () => {
    const taken = [{ name: 'shot.png' }, { name: 'shot (2).png' }];

    expect(uniqueImageName('shot.png', taken)).toBe('shot (3).png');
    expect(uniqueImageName('other.png', taken)).toBe('other.png');
    expect(uniqueImageName('README', [{ name: 'README' }])).toBe('README (2)');
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
      messageImagesProblem([], image(1024 * 1024), {
        bytes: SESSION_IMAGES_MAX_BYTES - 1024,
        count: 1,
      }),
    ).toMatch(
      /^This session already carries 16\.0 MiB of images, .* Start a new session to send more images\.$/,
    );
  });

  it('stops at the number of images a session carries', () => {
    expect(
      messageImagesProblem([], image(1), {
        bytes: 0,
        count: SESSION_IMAGES_MAX_COUNT,
      }),
    ).toMatch(/^This session already carries 50 images, /);
  });
});

describe('attachedImagesProblem', () => {
  const image = (byteSize: number) => ({ byteSize });

  it('says nothing of images a message can carry', () => {
    expect(attachedImagesProblem([image(1), image(1)])).toBeUndefined();
    expect(attachedImagesProblem([])).toBeUndefined();
  });

  it('names what is too much: the count, the bytes, the session', () => {
    expect(
      attachedImagesProblem(Array.from({ length: 5 }, () => image(1))),
    ).toBe(
      '5 images are attached; a message can carry 4. Remove some, and send them with the next message.',
    );
    expect(
      attachedImagesProblem([image(2 * 1024 * 1024), image(2 * 1024 * 1024)]),
    ).toBe(
      'The images attached come to 4.0 MiB; a message can carry 3 MiB. Remove one, and send it with the next message.',
    );
    expect(
      attachedImagesProblem([image(1)], {
        bytes: SESSION_IMAGES_MAX_BYTES,
        count: 3,
      }),
    ).toMatch(/Start a new session to send more images\.$/);
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

  it.each([
    ['Ollama', 'Ollama'],
    ['Bedrock', 'Bedrock'],
    ['Mistral', 'Mistral'],
    ['SAPAICore', 'SAP AI Core'],
  ])('names a %s model, which kagent sends no images', (provider, label) => {
    expect(
      imagesUnsupportedReason({
        name: 'Local',
        harnessRuntime: 'kagent',
        modelProvider: provider,
      }),
    ).toBe(
      `Local cannot take images: kagent does not pass images to ${label} models.`,
    );
  });

  it('does not guess while the runtime or the model is unread', () => {
    expect(imagesUnsupportedReason({ name: 'A' })).toBe(
      "The portal cannot tell yet whether A can take images: it has not read the agent's runtime. Try again in a moment.",
    );
    expect(
      imagesUnsupportedReason({ name: 'A', harnessRuntime: 'kagent' }),
    ).toBe(
      "The portal cannot tell yet whether A can take images: it has not read the agent's model. Try again in a moment.",
    );
  });

  it.each([
    'Anthropic',
    'AnthropicVertexAI',
    'AzureOpenAI',
    'Foundry',
    'Gemini',
    'GeminiVertexAI',
    'OpenAI',
  ])('says nothing for the Go ADK runtime on %s', provider => {
    expect(
      imagesUnsupportedReason({
        name: 'A',
        harnessRuntime: 'kagent',
        modelProvider: provider,
      }),
    ).toBeUndefined();
  });

  it('says nothing for a custom runtime, its own A2A server', () => {
    expect(
      imagesUnsupportedReason({ name: 'A', harnessRuntime: 'byo' }),
    ).toBeUndefined();
  });
});

describe('toMessageImages', () => {
  it('sends the type, the bytes read out of the preview and the name', () => {
    expect(
      toMessageImages([
        {
          id: 'image-1',
          name: 'a.png',
          mediaType: 'image/png',
          byteSize: 70,
          previewUrl: `data:image/png;base64,${PNG_BASE64}`,
        },
      ]),
    ).toEqual([{ mediaType: 'image/png', data: PNG_BASE64, name: 'a.png' }]);
  });
});
