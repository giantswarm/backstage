/**
 * Which logo a connector shows: the icon muster wrote to its MCPServer's
 * `.status.icon` (the server's own, or muster's mark for a known service),
 * else none (the letter tile). Pure, so the check is testable without a DOM.
 */

/** The icon formats muster passes on, as base64 `data:` URIs only. */
const ICON_PATTERN =
  /^data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** The whole data: URI is at most 65536 characters, muster's cap. */
const MAX_ICON_LENGTH = 65536;

/**
 * The MCPServer's `.status.icon` when it is safe to put in an `<img>`: a
 * base64 `data:` URI of an SVG, PNG, JPEG or WebP image within muster's cap.
 */
export function connectorIconOf(icon: unknown): string | undefined {
  return typeof icon === 'string' &&
    icon.length <= MAX_ICON_LENGTH &&
    ICON_PATTERN.test(icon)
    ? icon
    : undefined;
}
