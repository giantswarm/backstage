import { InputError } from '@backstage/errors';
import {
  MESSAGE_IMAGE_MAX_BYTES,
  MESSAGE_IMAGE_MAX_COUNT,
  MESSAGE_IMAGE_MAX_EDGE,
  MESSAGE_IMAGE_TYPES,
  MESSAGE_IMAGES_MAX_TOTAL_BYTES,
  MessageImageType,
  normalizeBase64,
  readImageDimensions,
  SESSION_IMAGES_MAX_BYTES,
  SESSION_IMAGES_MAX_COUNT,
  sniffImageType,
  SNIFF_BYTES,
} from '@giantswarm/backstage-plugin-agent-platform-common';

/** An image of a message, decoded and checked, as it goes into an A2A part. */
export type MessageImagePart = {
  mediaType: MessageImageType;
  bytes: Uint8Array;
  name?: string;
};

/** Longest file name kept; a longer one is cut, not refused. */
const NAME_MAX_LENGTH = 200;

/**
 * The images of a message body, decoded and checked, or none when the body
 * carries no `images`.
 *
 * The composer checks the same rules first and says what to do about a
 * broken one; this is the guard behind it, so its messages are terse. The
 * declared type is believed only when the bytes say the same: an image is
 * sent to the model, and stored in the transcript, as what its bytes are.
 */
export function readMessageImages(raw: unknown): MessageImagePart[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new InputError('images must be an array');
  }
  if (raw.length > MESSAGE_IMAGE_MAX_COUNT) {
    throw new InputError(
      `a message carries at most ${MESSAGE_IMAGE_MAX_COUNT} images`,
    );
  }
  let total = 0;
  return raw.map((entry, index) => {
    const field = `images[${index}]`;
    if (typeof entry !== 'object' || entry === null) {
      throw new InputError(`${field} must be an object`);
    }
    const { mediaType, data, name } = entry as Record<string, unknown>;
    if (
      typeof mediaType !== 'string' ||
      !(MESSAGE_IMAGE_TYPES as readonly string[]).includes(mediaType)
    ) {
      throw new InputError(
        `${field}.mediaType must be one of ${MESSAGE_IMAGE_TYPES.join(', ')}`,
      );
    }
    if (typeof data !== 'string') {
      throw new InputError(`${field}.data must be a base64 string`);
    }
    // Bounded before it is read: a payload past the cap is refused from its
    // length alone.
    if ((data.length / 4) * 3 > MESSAGE_IMAGE_MAX_BYTES + 3) {
      throw new InputError(
        `${field} is larger than ${MESSAGE_IMAGE_MAX_BYTES} bytes`,
      );
    }
    const base64 = normalizeBase64(data);
    if (base64 === undefined) {
      throw new InputError(`${field}.data must be a base64 string`);
    }
    // A Buffer is a Uint8Array already; the part takes it as it is.
    const bytes: Uint8Array = Buffer.from(base64, 'base64');
    if (bytes.length === 0) {
      throw new InputError(`${field}.data must not be empty`);
    }
    if (bytes.length > MESSAGE_IMAGE_MAX_BYTES) {
      throw new InputError(
        `${field} is larger than ${MESSAGE_IMAGE_MAX_BYTES} bytes`,
      );
    }
    if (sniffImageType(bytes.subarray(0, SNIFF_BYTES)) !== mediaType) {
      throw new InputError(`${field} is not the ${mediaType} it says it is`);
    }
    // The composer scales every image to this; one that was not would fail
    // the model's request on this turn and every later one.
    const size = readImageDimensions(base64);
    if (!size) {
      throw new InputError(`${field} has no readable image header`);
    }
    if (Math.max(size.width, size.height) > MESSAGE_IMAGE_MAX_EDGE) {
      throw new InputError(
        `${field} is ${size.width}×${size.height} pixels; an image can be at most ${MESSAGE_IMAGE_MAX_EDGE} pixels on its longer side`,
      );
    }
    total += bytes.length;
    if (total > MESSAGE_IMAGES_MAX_TOTAL_BYTES) {
      throw new InputError(
        `the images of a message must not exceed ${MESSAGE_IMAGES_MAX_TOTAL_BYTES} bytes in all`,
      );
    }
    if (name !== undefined && typeof name !== 'string') {
      throw new InputError(`${field}.name must be a string`);
    }
    const trimmed = name?.trim().slice(0, NAME_MAX_LENGTH);
    return {
      mediaType: mediaType as MessageImageType,
      bytes,
      ...(trimmed ? { name: trimmed } : {}),
    };
  });
}

/** The images a session's messages already carry. */
export type SessionImageUsage = { bytes: number; count: number };

const MIB = 1024 * 1024;

/**
 * Refuse a message whose images would take the session past what every later
 * turn can resend: `SESSION_IMAGES_MAX_BYTES` and `SESSION_IMAGES_MAX_COUNT`.
 * The composer checks the same first; this is what holds for every caller.
 * Worded for the person, since the composer shows it as the reason the
 * message was not sent.
 */
export function assertSessionImageBudget(
  usage: SessionImageUsage,
  images: readonly MessageImagePart[],
): void {
  const count = usage.count + images.length;
  const bytes =
    usage.bytes + images.reduce((sum, image) => sum + image.bytes.length, 0);
  if (count > SESSION_IMAGES_MAX_COUNT) {
    throw new InputError(
      `This session already carries ${usage.count} images, and the model is sent all of them every turn; a session can carry ${SESSION_IMAGES_MAX_COUNT}. Start a new session to send more images.`,
    );
  }
  if (bytes > SESSION_IMAGES_MAX_BYTES) {
    throw new InputError(
      `This session already carries ${(usage.bytes / MIB).toFixed(
        1,
      )} MiB of images, and the model is sent all of them every turn; a session can carry ${
        SESSION_IMAGES_MAX_BYTES / MIB
      } MiB. Start a new session to send more images.`,
    );
  }
}
