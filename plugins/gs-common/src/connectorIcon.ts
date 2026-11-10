/**
 * Which logo a connector shows: the icon muster wrote to its MCPServer's
 * `.status.icon` (the server's own, or muster's mark for a known service), or
 * the one muster itself announces in its `initialize` result, else none (the
 * letter tile). Shared so muster-backend picks muster's icon by the rule the
 * frontend renders with. Pure, so the check is testable without a DOM.
 */

/** The icon formats muster passes on, as base64 `data:` URIs only. */
const ICON_PATTERN =
  /^data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** The whole data: URI is at most 65536 characters, muster's cap. */
const MAX_ICON_LENGTH = 65536;

/**
 * The icon when it is safe to put in an `<img>`: a base64 `data:` URI of an
 * SVG, PNG, JPEG or WebP image within muster's cap.
 *
 * Security: the icon may be an SVG from an MCP server. Only ever render it
 * as an `<img src>` (bui's `Avatar`), where the browser runs no script and
 * loads nothing. Never `dangerouslySetInnerHTML`, `<object>`, `<embed>` or
 * `<iframe>`, and never fetch the markup to theme it. This check stays even
 * though muster validates too: the CRD does not, so it is the only check
 * every writer of `.status.icon` passes.
 */
export function connectorIconOf(icon: unknown): string | undefined {
  return typeof icon === 'string' &&
    icon.length <= MAX_ICON_LENGTH &&
    ICON_PATTERN.test(icon)
    ? icon
    : undefined;
}

/**
 * The icon an MCP server announces in its `initialize` result's
 * `serverInfo.icons` (`[{ src, mimeType?, sizes?, theme? }]`), among those
 * whose `src` {@link connectorIconOf} accepts: the first without a `theme`,
 * which reads on light and dark pages alike, else the first of all. The logo
 * renders on either theme, and the server knows neither, so a `light` or
 * `dark` variant is a fallback only. muster (v5.59.0 and later) announces
 * one, the Giant Swarm logo, as an SVG `data:` URI without a theme.
 */
export function serverInfoIconOf(serverInfo: unknown): string | undefined {
  const icons =
    serverInfo && typeof serverInfo === 'object'
      ? (serverInfo as { icons?: unknown }).icons
      : undefined;
  if (!Array.isArray(icons)) {
    return undefined;
  }
  const usable = icons.flatMap(icon => {
    if (!icon || typeof icon !== 'object') {
      return [];
    }
    const { src, theme } = icon as { src?: unknown; theme?: unknown };
    const checked = connectorIconOf(src);
    return checked ? [{ src: checked, themed: theme !== undefined }] : [];
  });
  return (usable.find(icon => !icon.themed) ?? usable[0])?.src;
}
