/**
 * The longest message text the Agent Platform sends to a session, in
 * characters: the backend refuses longer text, and the composers and the
 * hand-offs stop before it. One constant for both ends, so they cannot drift.
 *
 * Ours, not kagent's — nothing upstream validates the text. Generous on purpose,
 * because pasting logs or a manifest into a prompt is a normal thing to do; it
 * exists to keep an absurd payload from becoming an agent's whole context window.
 *
 * Counts UTF-16 code units (JavaScript's `String.length`), so a character
 * outside the BMP costs two.
 */
export const MESSAGE_TEXT_MAX_LENGTH = 32_000;

/**
 * The image types a message may carry: the raster types the transcript renders
 * inline (`PREVIEWABLE_IMAGE_TYPES`), so whatever is sent can be shown back.
 * Each is checked against its magic bytes, on both ends, never by its name.
 */
export const MESSAGE_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export type MessageImageType = (typeof MESSAGE_IMAGE_TYPES)[number];

/** Images one message may carry. */
export const MESSAGE_IMAGE_MAX_COUNT = 4;

/**
 * The largest image a message may carry, in bytes, after the composer has
 * scaled it down to {@link MESSAGE_IMAGE_MAX_EDGE}.
 */
export const MESSAGE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * The most image bytes one message may carry in all.
 *
 * Set by the narrowest hop on the way to the model: kagent's controller
 * relays the message to the agent's runtime over gRPC with that library's
 * default 4 MiB message limit, on the request and on the task the runtime
 * answers with (which echoes the message). 3 MiB leaves the text and the
 * envelope their room.
 */
export const MESSAGE_IMAGES_MAX_TOTAL_BYTES = 3 * 1024 * 1024;

/**
 * The most image bytes a session may carry over all its messages.
 *
 * Every turn sends the model the whole conversation, images included, and
 * base64-encoded: Anthropic refuses a request over 32 MB, and agentgateway
 * buffers an LLM request up to 32 MiB. Past that, every later turn of the
 * session fails. 16 MiB is ~21 MiB encoded, which leaves the text its room.
 */
export const SESSION_IMAGES_MAX_BYTES = 16 * 1024 * 1024;

/**
 * The longest side, in pixels, the composer sends an image at; a larger one is
 * scaled down first. Models scale larger images down themselves (Claude to
 * 1568 px), and Anthropic refuses images over 2000 px once a request carries
 * more than 20 — which a long session with images reaches.
 */
export const MESSAGE_IMAGE_MAX_EDGE = 2000;

/**
 * An image as a message carries it to the backend: the bytes base64-encoded,
 * the type the bytes were checked to be, and the file's name when it had one.
 */
export type MessageImage = {
  mediaType: MessageImageType;
  /** Standard, padded base64. */
  data: string;
  name?: string;
};
