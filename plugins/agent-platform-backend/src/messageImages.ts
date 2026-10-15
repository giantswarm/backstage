import { InputError } from '@backstage/errors';
import {
  MESSAGE_IMAGE_MAX_BYTES,
  MESSAGE_IMAGE_MAX_COUNT,
  MESSAGE_IMAGE_TYPES,
  MESSAGE_IMAGES_MAX_TOTAL_BYTES,
  MessageImageType,
  normalizeBase64,
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
    const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
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
