import {
  formatBytes,
  MESSAGE_IMAGE_MAX_BYTES,
  MESSAGE_IMAGE_MAX_COUNT,
  MESSAGE_IMAGE_MAX_EDGE,
  MESSAGE_IMAGES_MAX_TOTAL_BYTES,
  MessageImage,
  MessageImageType,
  SESSION_IMAGES_MAX_BYTES,
  SESSION_IMAGES_MAX_COUNT,
  sniffImageType,
  SNIFF_BYTES,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import type { AgentRow } from '../components/AgentsDataProvider';
import { runtimeLabel } from './harnesses';

/**
 * An image attached in a composer, ready to send and to show. The bytes live
 * once, in {@link previewUrl}; {@link toMessageImages} reads them out of it.
 */
export type ComposerImage = {
  /** Unique within the composer, for keys and removal. */
  id: string;
  /** The name shown and announced, unique within the composer. */
  name: string;
  /** The type the image is encoded as, which its bytes were checked to be. */
  mediaType: MessageImageType;
  /** Encoded size in bytes. */
  byteSize: number;
  /** `data:<mediaType>;base64,…` of the bytes as sent. */
  previewUrl: string;
};

/** The images a session's messages already carry, which the next adds to. */
export type SessionImages = { bytes: number; count: number };

const NO_SESSION_IMAGES: SessionImages = { bytes: 0, count: 0 };

/**
 * The largest file the composer reads at all. A photo straight off a phone
 * is under it; scaled down to {@link MESSAGE_IMAGE_MAX_EDGE} it fits the
 * per-image cap. Past it, decoding alone would cost the tab its memory.
 */
export const IMAGE_SOURCE_MAX_BYTES = 40 * 1024 * 1024;

/** Quality for a JPEG or WebP: no visible loss in a screenshot. */
const ENCODE_QUALITY = 0.9;

/** A limit as the copy names it: "3 MiB", not formatBytes' "3.0 MiB". */
function formatLimit(bytes: number): string {
  return `${bytes / (1024 * 1024)} MiB`;
}

const TYPE_NAMES = 'PNG, JPEG, GIF or WebP';

const UNPREPARABLE =
  'This browser cannot prepare images for sending. Use a current version of Chrome, Edge, Firefox or Safari.';

export type PreparedImage =
  | { kind: 'image'; image: Omit<ComposerImage, 'id'> }
  | { kind: 'refused'; problem: string };

/**
 * Turn a pasted or dropped file into an image a message can carry, or
 * say why it cannot be one.
 *
 * The type is read from the bytes, never from the file's name or its declared
 * type. Then the image is **always drawn and encoded again**, which is what
 * makes it safe to send:
 *
 * - its metadata stays behind — a photo's GPS position, device and times
 *   would otherwise reach the model provider and the transcript, which the
 *   session's share links show (the orientation it recorded is applied first);
 * - its longer side is at most {@link MESSAGE_IMAGE_MAX_EDGE}, so no size that
 *   fails a model's request reaches the conversation, which every later turn
 *   resends.
 *
 * PNG, JPEG and WebP keep their format, falling back to PNG where the browser
 * cannot encode one (WebP in older Safari). A GIF becomes a PNG of its first
 * frame, which is all the models read of one anyway. Then the size cap applies
 * to what would be sent.
 */
export async function prepareImage(
  file: Blob,
  name: string,
): Promise<PreparedImage> {
  if (file.size > IMAGE_SOURCE_MAX_BYTES) {
    return {
      kind: 'refused',
      problem: `${name} is ${formatBytes(file.size)}, too large to attach. Attach an image under ${formatLimit(IMAGE_SOURCE_MAX_BYTES)}.`,
    };
  }
  const head = new Uint8Array(
    await readArrayBuffer(file.slice(0, SNIFF_BYTES)),
  );
  const sniffed = sniffImageType(head);
  if (!sniffed) {
    return {
      kind: 'refused',
      problem: `${name} is not an image the agent can take. Attach a ${TYPE_NAMES} image.`,
    };
  }

  const encoded = await encodeAgain(file, sniffed);
  if (encoded === 'unreadable') {
    return {
      kind: 'refused',
      problem: `${name} could not be read as an image. Attach a ${TYPE_NAMES} image.`,
    };
  }
  if (encoded === 'unsupported') {
    return { kind: 'refused', problem: UNPREPARABLE };
  }

  const { blob, mediaType, scaled } = encoded;
  // Named for what it is sent as: a GIF sent as a PNG, a PNG called .jpg,
  // a name without an extension.
  const sentName = hasExtensionOf(name, mediaType)
    ? name
    : withExtension(name, extensionOf(mediaType));
  if (blob.size > MESSAGE_IMAGE_MAX_BYTES) {
    return {
      kind: 'refused',
      problem: `${name} is ${formatBytes(blob.size)}${
        scaled ? ' after scaling it down' : ''
      }; an image can be at most ${formatLimit(
        MESSAGE_IMAGE_MAX_BYTES,
      )}. Crop it, or save it as a JPEG.`,
    };
  }

  return {
    kind: 'image',
    image: {
      name: sentName,
      mediaType,
      byteSize: blob.size,
      previewUrl: await readDataUrl(blob, mediaType),
    },
  };
}

type Encoded = { blob: Blob; mediaType: MessageImageType; scaled: boolean };

/**
 * The image drawn and encoded again, at most {@link MESSAGE_IMAGE_MAX_EDGE} on
 * its longer side; `'unreadable'` when the browser cannot decode it and
 * `'unsupported'` when it cannot draw or encode one at all.
 */
async function encodeAgain(
  file: Blob,
  sniffed: MessageImageType,
): Promise<Encoded | 'unreadable' | 'unsupported'> {
  if (typeof createImageBitmap !== 'function') {
    return 'unsupported';
  }
  let bitmap: ImageBitmap;
  try {
    // `from-image` applies the orientation the metadata records, which the
    // new encoding no longer carries.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return 'unreadable';
  }
  try {
    const longer = Math.max(bitmap.width, bitmap.height);
    const ratio =
      longer > MESSAGE_IMAGE_MAX_EDGE ? MESSAGE_IMAGE_MAX_EDGE / longer : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) {
      return 'unsupported';
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const wanted: MessageImageType =
      sniffed === 'image/gif' ? 'image/png' : sniffed;
    for (const mediaType of new Set<MessageImageType>([wanted, 'image/png'])) {
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, mediaType, ENCODE_QUALITY),
      );
      // A browser that cannot encode the type answers with a PNG or nothing.
      if (blob && blob.type === mediaType) {
        return { blob, mediaType, scaled: ratio < 1 };
      }
    }
    return 'unsupported';
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

function extensionOf(mediaType: MessageImageType): string {
  return mediaType === 'image/jpeg' ? 'jpg' : mediaType.slice('image/'.length);
}

function hasExtensionOf(name: string, mediaType: MessageImageType): boolean {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return mediaType === 'image/jpeg'
    ? extension === 'jpg' || extension === 'jpeg'
    : extension === mediaType.slice('image/'.length);
}

function withExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}.${extension}`;
}

/**
 * `name`, or — when an attached image is already called that — the same with
 * " (2)", " (3)", … before its extension, so each remove control is announced
 * by a name of its own.
 */
export function uniqueImageName(
  name: string,
  taken: readonly Pick<ComposerImage, 'name'>[],
): string {
  const names = new Set(taken.map(image => image.name));
  if (!names.has(name)) {
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let copy = 2; ; copy += 1) {
    const candidate = `${stem} (${copy})${extension}`;
    if (!names.has(candidate)) {
      return candidate;
    }
  }
}

/**
 * What a pasted image is called. Not the file's name: browsers call every
 * pasted image `image.png`. {@link prepareImage} adds the extension of the
 * type it is sent as.
 */
export const PASTED_IMAGE_NAME = 'Pasted image';

function sessionBudgetProblem(
  session: SessionImages,
  bytes: number,
  count: number,
): string | undefined {
  if (session.count + count > SESSION_IMAGES_MAX_COUNT) {
    return `This session already carries ${session.count} images, and the model is sent all of them every turn; a session can carry ${SESSION_IMAGES_MAX_COUNT}. Start a new session to send more images.`;
  }
  if (session.bytes + bytes > SESSION_IMAGES_MAX_BYTES) {
    return `This session already carries ${formatBytes(
      session.bytes,
    )} of images, and the model is sent all of them every turn; a session can carry ${formatLimit(
      SESSION_IMAGES_MAX_BYTES,
    )}. Start a new session to send more images.`;
  }
  return undefined;
}

/**
 * Why adding `adding` to the images already attached would break a limit of
 * the message or the session, or `undefined` when it fits.
 */
export function messageImagesProblem(
  attached: readonly Pick<ComposerImage, 'byteSize'>[],
  adding: Pick<ComposerImage, 'byteSize' | 'name'>,
  session: SessionImages = NO_SESSION_IMAGES,
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
  return sessionBudgetProblem(
    session,
    total + adding.byteSize,
    attached.length + 1,
  );
}

/**
 * Why the images attached cannot be sent as they are, or `undefined` when
 * they can. For a box whose images were not all checked together: a failed
 * message's put back beside ones attached meanwhile, or a session that has
 * grown since they were attached.
 */
export function attachedImagesProblem(
  images: readonly Pick<ComposerImage, 'byteSize'>[],
  session: SessionImages = NO_SESSION_IMAGES,
): string | undefined {
  if (images.length > MESSAGE_IMAGE_MAX_COUNT) {
    return `${images.length} images are attached; a message can carry ${MESSAGE_IMAGE_MAX_COUNT}. Remove some, and send them with the next message.`;
  }
  const total = images.reduce((sum, image) => sum + image.byteSize, 0);
  if (total > MESSAGE_IMAGES_MAX_TOTAL_BYTES) {
    return `The images attached come to ${formatBytes(
      total,
    )}; a message can carry ${formatLimit(
      MESSAGE_IMAGES_MAX_TOTAL_BYTES,
    )}. Remove one, and send it with the next message.`;
  }
  return images.length > 0
    ? sessionBudgetProblem(session, total, images.length)
    : undefined;
}

/**
 * The model providers whose kagent model adapter hands images to the model:
 * the Go ADK's OpenAI adapter (OpenAI, Azure OpenAI, Foundry), its Anthropic
 * one (Anthropic, Anthropic on Vertex AI) and ADK's own Gemini model. Its
 * Ollama, Bedrock, Mistral and SAP AI Core adapters drop images without a
 * word, so the agent would answer as if none was sent.
 */
const IMAGE_PROVIDERS: ReadonlySet<string> = new Set([
  'Anthropic',
  'AnthropicVertexAI',
  'AzureOpenAI',
  'Foundry',
  'Gemini',
  'GeminiVertexAI',
  'OpenAI',
]);

const PROVIDER_LABELS: Record<string, string> = {
  SAPAICore: 'SAP AI Core',
};

/**
 * Why the agent cannot take images, or `undefined` when it can — as far as the
 * portal can tell, which stops at the model: kagent records nothing about
 * whether a given model takes images, and an OpenAI-compatible endpoint
 * serving a text-only one refuses the turn.
 *
 * What the portal does know: kagent's Claude Code and Codex runtimes accept a
 * message of exactly one text part and fail the turn otherwise, and its Go ADK
 * runtime passes images only to the providers in {@link IMAGE_PROVIDERS}. A
 * runtime or provider not read yet is not guessed at: images wait until it
 * is. A custom runtime (`byo`) is its own A2A server and is given them.
 */
export function imagesUnsupportedReason(
  agent: Pick<AgentRow, 'name' | 'harnessRuntime' | 'modelProvider'>,
): string | undefined {
  const runtime = agent.harnessRuntime;
  if (runtime === 'claude' || runtime === 'codex') {
    return `${agent.name} cannot take images: its ${runtimeLabel(
      runtime,
    )} runtime accepts text only.`;
  }
  if (runtime === 'byo') {
    return undefined;
  }
  if (runtime === undefined) {
    return `The portal cannot tell yet whether ${agent.name} can take images: it has not read the agent's runtime. Try again in a moment.`;
  }
  const provider = agent.modelProvider;
  if (provider === undefined) {
    return `The portal cannot tell yet whether ${agent.name} can take images: it has not read the agent's model. Try again in a moment.`;
  }
  if (!IMAGE_PROVIDERS.has(provider)) {
    return `${agent.name} cannot take images: kagent does not pass images to ${
      PROVIDER_LABELS[provider] ?? provider
    } models.`;
  }
  return undefined;
}

/** The images of a message as the API sends them. */
export function toMessageImages(
  images: readonly ComposerImage[],
): MessageImage[] {
  return images.map(({ mediaType, previewUrl, name }) => ({
    mediaType,
    data: previewUrl.slice(previewUrl.indexOf(',') + 1),
    name,
  }));
}
