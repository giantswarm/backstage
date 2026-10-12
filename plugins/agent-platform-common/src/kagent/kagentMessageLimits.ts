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
