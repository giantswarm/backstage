import {
  formatBytes,
  MESSAGE_IMAGE_MAX_BYTES,
  MESSAGE_IMAGE_MAX_COUNT,
  MESSAGE_IMAGE_MAX_EDGE,
  MESSAGE_IMAGES_MAX_TOTAL_BYTES,
  MessageImage,
  MessageImageType,
  SESSION_IMAGES_MAX_BYTES,
  sniffImageType,
  SNIFF_BYTES,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import type { AgentRow } from '../components/AgentsDataProvider';
import { runtimeLabel } from './harnesses';

/** An image attached in a composer, ready to send and to show. */
export type ComposerImage = MessageImage & {
  /** Unique within the composer, for keys and removal. */
  id: string;
  /** The name shown and announced: the file's, or one made up for a paste. */
  name: string;
  /** Decoded size in bytes. */
  byteSize: number;
  /** `data:` URL of the bytes as sent, typed by what the bytes are. */
  previewUrl: string;
};

/**
 * The largest file the composer reads at all. A photo straight off a phone
 * is under it; scaled down to {@link MESSAGE_IMAGE_MAX_EDGE} it fits the
 * per-image cap. Past it, decoding alone would cost the tab its memory.
 */
export const IMAGE_SOURCE_MAX_BYTES = 40 * 1024 * 1024;

/** Quality for a scaled-down JPEG or WebP: no visible loss in a screenshot. */
const SCALED_QUALITY = 0.9;

/** A limit as the copy names it: "3 MiB", not formatBytes' "3.0 MiB". */
function formatLimit(bytes: number): string {
  return `${bytes / (1024 * 1024)} MiB`;
}

const TYPE_NAMES = 'PNG, JPEG, GIF or WebP';

export type PreparedImage =
  | { kind: 'image'; image: ComposerImage }
  | { kind: 'refused'; problem: string };

let nextId = 0;

/**
 * Turn a pasted, dropped or picked file into an image a message can carry, or
 * say why it cannot be one.
 *
 * The type is read from the bytes, never from the file's name or its declared
 * type. A PNG, JPEG or WebP larger than {@link MESSAGE_IMAGE_MAX_EDGE} on its
 * longer side is scaled down to it in the same format; a GIF is kept as it
 * is, because drawing it would keep only its first frame. Then the size cap
 * applies to what would be sent.
 */
export async function prepareImage(
  file: Blob,
  fallbackName: string,
): Promise<PreparedImage> {
  const name =
    file instanceof File && file.name.trim() ? file.name.trim() : fallbackName;
  if (file.size > IMAGE_SOURCE_MAX_BYTES) {
    return {
      kind: 'refused',
      problem: `${name} is ${formatBytes(file.size)}, too large to attach. Attach an image under ${formatLimit(IMAGE_SOURCE_MAX_BYTES)}.`,
    };
  }
  const head = new Uint8Array(
    await readArrayBuffer(file.slice(0, SNIFF_BYTES)),
  );
  const mediaType = sniffImageType(head);
  if (!mediaType) {
    return {
      kind: 'refused',
      problem: `${name} is not an image the agent can take. Attach a ${TYPE_NAMES} image.`,
    };
  }

  let bytes: Blob = file;
  let scaled = false;
  if (mediaType !== 'image/gif') {
    const smaller = await scaleDown(file, mediaType);
    if (smaller === 'unreadable') {
      return {
        kind: 'refused',
        problem: `${name} could not be read as an image. Attach a ${TYPE_NAMES} image.`,
      };
    }
    if (smaller) {
      bytes = smaller;
      scaled = true;
    }
  }

  if (bytes.size > MESSAGE_IMAGE_MAX_BYTES) {
    return {
      kind: 'refused',
      problem: `${name} is ${formatBytes(bytes.size)}${
        scaled ? ' after scaling it down' : ''
      }; an image can be at most ${formatLimit(MESSAGE_IMAGE_MAX_BYTES)}. ${
        mediaType === 'image/gif'
          ? 'Attach a shorter GIF, or a still of it as a PNG.'
          : 'Crop it, or save it as a JPEG.'
      }`,
    };
  }

  const previewUrl = await readDataUrl(bytes, mediaType);
  nextId += 1;
  return {
    kind: 'image',
    image: {
      id: `image-${nextId}`,
      name,
      mediaType,
      data: previewUrl.slice(previewUrl.indexOf(',') + 1),
      byteSize: bytes.size,
      previewUrl,
    },
  };
}

/**
 * The image scaled down to {@link MESSAGE_IMAGE_MAX_EDGE}, `undefined` when it
 * is no larger than that (or the browser cannot scale), and `'unreadable'`
 * when the browser cannot decode it.
 */
async function scaleDown(
  file: Blob,
  mediaType: MessageImageType,
): Promise<Blob | undefined | 'unreadable'> {
  if (typeof createImageBitmap !== 'function') {
    return undefined;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return 'unreadable';
  }
  try {
    const longer = Math.max(bitmap.width, bitmap.height);
    if (longer <= MESSAGE_IMAGE_MAX_EDGE) {
      return undefined;
    }
    const ratio = MESSAGE_IMAGE_MAX_EDGE / longer;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) {
      return undefined;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, mediaType, SCALED_QUALITY),
    );
    // A browser that cannot encode the type (WebP in old Safari) answers with
    // a PNG or nothing; sending the original then is better than a mislabel.
    return blob && blob.type === mediaType ? blob : undefined;
  } finally {
    bitmap.close();
  }
}

function readArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** The bytes as a `data:` URL typed by `mediaType`, whatever the blob says. */
async function readDataUrl(
  blob: Blob,
  mediaType: MessageImageType,
): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return `data:${mediaType};base64,${url.slice(url.indexOf(',') + 1)}`;
}

/**
 * Why adding `adding` to the images already attached would break a limit of
 * the message or the session, or `undefined` when it fits.
 */
export function messageImagesProblem(
  attached: readonly Pick<ComposerImage, 'byteSize'>[],
  adding: Pick<ComposerImage, 'byteSize' | 'name'>,
  sessionBytes = 0,
): string | undefined {
  if (attached.length >= MESSAGE_IMAGE_MAX_COUNT) {
    return `A message can carry ${MESSAGE_IMAGE_MAX_COUNT} images. Remove one to attach ${adding.name}, or send it with the next message.`;
  }
  const total = attached.reduce((sum, image) => sum + image.byteSize, 0);
  if (total + adding.byteSize > MESSAGE_IMAGES_MAX_TOTAL_BYTES) {
    return `With ${adding.name}, the images come to ${formatBytes(
      total + adding.byteSize,
    )}; a message can carry ${formatLimit(
      MESSAGE_IMAGES_MAX_TOTAL_BYTES,
    )}. Send it with the next message.`;
  }
  if (sessionBytes + total + adding.byteSize > SESSION_IMAGES_MAX_BYTES) {
    return `This session already carries ${formatBytes(
      sessionBytes,
    )} of images, and the model is sent all of them every turn; a session can carry ${formatLimit(
      SESSION_IMAGES_MAX_BYTES,
    )}. Start a new session to send more images.`;
  }
  return undefined;
}

/**
 * Why the agent cannot take images, or `undefined` when it can — or when the
 * portal cannot tell, in which case the send says so if the model refuses.
 *
 * What the portal can know: kagent's Claude Code and Codex runtimes accept a
 * message of exactly one text part and fail the turn otherwise, and its Go ADK
 * runtime passes images to OpenAI-compatible, Anthropic and Gemini models but
 * drops them for Ollama. Whether a given model takes images, nothing in kagent
 * records; an OpenAI-compatible endpoint serving a text-only model refuses the
 * turn.
 */
export function imagesUnsupportedReason(
  agent:
    Pick<AgentRow, 'name' | 'harnessRuntime' | 'modelProvider'> | undefined,
): string | undefined {
  if (!agent) {
    return undefined;
  }
  if (agent.harnessRuntime === 'claude' || agent.harnessRuntime === 'codex') {
    return `${agent.name} cannot take images: its ${runtimeLabel(
      agent.harnessRuntime,
    )} runtime accepts text only.`;
  }
  if (agent.modelProvider === 'Ollama') {
    return `${agent.name} cannot take images: kagent does not pass images to Ollama models.`;
  }
  return undefined;
}

/** The images of a message as the API sends them. */
export function toMessageImages(
  images: readonly ComposerImage[],
): MessageImage[] {
  return images.map(({ mediaType, data, name }) => ({
    mediaType,
    data,
    name,
  }));
}

/** A name for a pasted image, which has none of its own. */
export function pastedImageName(mediaType: string, index: number): string {
  const extension =
    mediaType === 'image/jpeg' ? 'jpg' : mediaType.replace('image/', '');
  return `Pasted image${index > 0 ? ` ${index + 1}` : ''}.${
    /^[a-z]+$/.test(extension) ? extension : 'png'
  }`;
}
