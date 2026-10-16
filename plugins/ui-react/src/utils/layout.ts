/**
 * Heights of the app chrome a page's content sits beneath.
 *
 * A full-height panel — a sidebar that scrolls independently of the page, say —
 * has nothing to inherit its height from. The app shell's own sidebar is
 * `position: fixed` and sized against the viewport, while the content column is
 * static and content-sized, so a `height: 100%` chain collapses. The workable
 * approach is to anchor to the viewport and subtract the chrome above, which
 * means knowing how tall that chrome is.
 *
 * These live here rather than in a plugin because three of them had already
 * hardcoded the same numbers separately, which is how such a constant drifts
 * from the component it describes.
 */

/** `PluginHeader` from `@backstage/ui`, as rendered by the app's `PageLayout`. */
export const PLUGIN_HEADER_HEIGHT = 89;

/** Vertical padding of `Content` from `@backstage/core-components` (`spacing(3)`). */
export const CONTENT_PADDING = 24;

/**
 * What to subtract from `100dvh` for a panel that starts at the top of a page's
 * content area.
 *
 * ```ts
 * maxHeight: `calc(100dvh - ${PLUGIN_CONTENT_VIEWPORT_OFFSET}px)`
 * ```
 *
 * If `PluginHeader` ever changes height, every such panel is off by the
 * difference — it will overflow the viewport rather than scroll internally.
 */
export const PLUGIN_CONTENT_VIEWPORT_OFFSET =
  PLUGIN_HEADER_HEIGHT + CONTENT_PADDING;
