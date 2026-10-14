import { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles({
  kbd: {
    font: 'inherit',
    // Relative, so the cap keeps its proportion in whichever text holds it:
    // the palette's body-x-small footer and the composer's body-small hint.
    fontSize: '0.85em',
    border: '1px solid var(--bui-border-1)',
    borderRadius: 5,
    padding: '1px 5px',
    background: 'var(--bui-bg-neutral-1)',
    color: 'var(--bui-fg-secondary)',
    // A key drawn as an icon sits on the line like a glyph: one em tall and
    // lowered by an eighth, which keeps it inside the cap's border.
    '& svg': {
      fontSize: '1em',
      verticalAlign: '-0.125em',
    },
  },
});

export type KbdProps = {
  /** The key: its name, a glyph, or an icon with a hidden name. */
  children: ReactNode;
};

/**
 * A key cap in running text: the command palette's key hints and the
 * composers' send-key hints draw keys the same way.
 */
export function Kbd({ children }: KbdProps) {
  const classes = useStyles();
  return <kbd className={classes.kbd}>{children}</kbd>;
}
