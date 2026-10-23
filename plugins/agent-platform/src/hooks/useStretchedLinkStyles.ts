import { makeStyles } from '@material-ui/core/styles';

/**
 * A link whose hit area stretches over the whole of its row or card, so the
 * link is named by its text alone (an agent's or a session's name) while the
 * row stays one target, and buttons can sit in the row beside it rather than
 * inside a link.
 *
 * - `link` goes on the link. Its `::after` covers the nearest positioned
 *   ancestor, so the row or card sets `position: relative`. The overlay takes
 *   the link's own `border-radius`, so a rounded card gives its link the
 *   card's radius. The focus ring is drawn round the overlay, inset so a
 *   clipping list or scroll box does not cut it.
 * - `above` lifts an element over the overlay: a button, or anything with a
 *   tooltip of its own, which the overlay would otherwise cover.
 */
export const useStretchedLinkStyles = makeStyles({
  link: {
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: 'inherit',
    },
    '&[data-focus-visible]': {
      outline: 'none',
    },
    '&[data-focus-visible]::after': {
      outline: '2px solid var(--bui-ring)',
      outlineOffset: -2,
    },
  },
  above: {
    position: 'relative',
    zIndex: 1,
  },
});
