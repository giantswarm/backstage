import { SvgIcon, SvgIconProps } from '@material-ui/core';

/**
 * The Material Symbols pair for collapsing and expanding a side panel.
 *
 * These are hand-vendored because they do not exist in any icon package the repo
 * ships: `@material-ui/icons` 4.11.3 is the *classic* Material Icons set, and a
 * collapse/expand-panel glyph was never in it — searching all 1120 of its icons
 * for "collapse", "expand", "sidebar" or "drawer" returns nothing. The concept
 * arrived with Material Symbols, Google's later redesign, which is a separate
 * family and not packaged here.
 *
 * From Google's Material Symbols (`arrow_menu_close` / `arrow_menu_open`,
 * 24dp, outlined, weight 400), Apache-2.0. Their `0 -960 960 960` viewBox is
 * Symbols' own offset grid rather than the classic `0 0 24 24`, so it must
 * travel with the paths — dropping it renders the glyph off-canvas. `fill` is
 * left unset so `SvgIcon` supplies `currentColor`.
 */

/** Bar on the right, arrow pointing left: fold a left-hand panel away. */
export const ArrowMenuCloseIcon = (props: SvgIconProps) => (
  <SvgIcon {...props} viewBox="0 -960 960 960">
    <path d="M440-280v-400L240-480l200 200Zm80 160h80v-720h-80v720Z" />
  </SvgIcon>
);

/** Bar on the left, arrow pointing right: unfold a left-hand panel. */
export const ArrowMenuOpenIcon = (props: SvgIconProps) => (
  <SvgIcon {...props} viewBox="0 -960 960 960">
    <path d="M360-120v-720h80v720h-80Zm160-160v-400l200 200-200 200Z" />
  </SvgIcon>
);
