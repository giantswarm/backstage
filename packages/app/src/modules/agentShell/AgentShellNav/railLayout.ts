import { makeStyles } from '@material-ui/core/styles';

/**
 * How the shell's navigation lays its items out: the pinned desktop rail
 * (icon and title), the collapsed one (icon only, title as a tooltip), or the
 * phone's bottom bar (icon over a short visible label).
 */
export type RailLayout = 'expanded' | 'collapsed' | 'bar';

/**
 * One item of the phone's bottom bar, shared by its links, the Search button
 * and the Profile menu trigger so the five read as one row.
 *
 * Each item takes an equal share of the bar's width (75px at 375px) and at
 * least 48px of height — over the 44px touch-target floor (T22 §2.5). The
 * label is visible because a phone shows no `title`, and the current item is
 * marked along the bar's top edge: the rail's left-edge marker is drawn for a
 * vertical list.
 */
export const useBarItemStyles = makeStyles({
  slot: {
    flex: '1 1 0',
    minWidth: 0,
    display: 'flex',
  },
  item: {
    flex: '1 1 auto',
    minWidth: 0,
    minHeight: 48,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: '4px 2px',
    boxSizing: 'border-box',
    border: 0,
    borderRadius: 0,
    background: 'transparent',
    color: 'var(--bui-fg-secondary)',
    font: 'inherit',
    textDecoration: 'none',
    cursor: 'pointer',
    '&:hover': {
      color: 'var(--bui-fg-primary)',
      textDecoration: 'none',
    },
    '&:focus-visible, &[data-focus-visible]': {
      outline: '2px solid var(--bui-ring)',
      outlineOffset: -2,
    },
    '&[aria-current="page"], &[data-current="true"]': {
      color: 'var(--bui-fg-primary)',
      boxShadow:
        'inset 0 3px 0 var(--agent-shell-rail-item-active-bar, var(--bui-ring))',
    },
  },
  label: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 11,
    lineHeight: '14px',
    fontWeight: 500,
  },
});
