/**
 * The width to give a bui `Menu` (`<Menu maxWidth={MENU_WIDTH}>`), which is not
 * cosmetic.
 *
 * bui gives `.bui-MenuContent` `min-width: 150px` and otherwise leaves the width
 * to the content — its own `width` fallback is the string `"undefined"`, which
 * the browser discards. A `MenuItem` is a flex row with `gap: var(--bui-space-6)`
 * (24px) between label and trailing slot, so an item with an icon and a label of
 * a dozen characters wants just over the minimum. The popover then renders at
 * the natural width, settles back to 150px, and that second layout pass makes
 * the browser report "ResizeObserver loop completed with undelivered
 * notifications" from react-aria's popover observer on every open. Sentry
 * filters that message by default, but it trips the dev-server error overlay.
 *
 * Sizing the menu up front means one layout pass and no warning. bui applies
 * `maxWidth` as CSS `width` despite the name, so this is the definite width,
 * and an item longer than it wraps: "Remove model config" with its icon, the
 * longest item a menu here holds, takes ~13.2rem.
 */
export const MENU_WIDTH = '14rem';
