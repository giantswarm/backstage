import type { CSSProperties } from 'react';

/**
 * Layout for a `<form>` that wraps `DialogHeader`, `DialogBody` and
 * `DialogFooter` inside a bui `Dialog` (a form is what makes Enter submit).
 *
 * The dialog lays those three out as a flex column capped at the viewport
 * height, with the body as the part that scrolls (`flex: 1; min-height: 0;
 * overflow-y: auto`) and the content box `overflow: hidden`. A plain block
 * `<form>` between them takes its full content height, so the body never gets
 * a height to scroll in and a tall dialog's footer is clipped off the bottom
 * of the screen (giantswarm/backstage#2228). Making the form a flex column
 * that fills the content box restores the dialog's own layout.
 */
export const DIALOG_FORM_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
};
