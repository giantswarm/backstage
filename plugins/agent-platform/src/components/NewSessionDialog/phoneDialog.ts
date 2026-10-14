import { PHONE_MEDIA } from '@giantswarm/backstage-plugin-ui-react';

/**
 * A bui `Dialog` (its `className` lands on the modal) that is the whole screen
 * at phone width — for a dialog that takes text (T22 C4, plan §2.3). A
 * floating card at 375px sits under the soft keyboard: what was typed and the
 * button that sends it end up behind the keys, and the card's own max-height
 * leaves no room for anything else. Full-screen, the field and its button sit
 * at the top, above the keyboard. The command palette was the first such
 * dialog; the new-session composer and the rename dialog follow it.
 *
 * `!important` because bui sizes the modal through its own custom properties
 * and a `width: min(…)` the dialog's `width` prop feeds.
 */
export const PHONE_FULL_SCREEN_DIALOG = {
  [PHONE_MEDIA]: {
    width: '100vw !important',
    minWidth: '100vw !important',
    maxWidth: '100vw !important',
    height: '100dvh',
    maxHeight: '100dvh !important',
    borderRadius: 0,
    margin: 0,
  },
} as const;
