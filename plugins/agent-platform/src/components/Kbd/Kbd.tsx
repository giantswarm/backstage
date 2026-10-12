import { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles({
  kbd: {
    font: 'inherit',
    fontSize: '0.71875rem',
    border: '1px solid var(--bui-border-1)',
    borderRadius: 5,
    padding: '1px 5px',
    background: 'var(--bui-bg-neutral-1)',
    color: 'var(--bui-fg-secondary)',
    // A key drawn as an icon (Return) sits on the text's line like a glyph.
    '& svg': {
      fontSize: '1.2em',
      verticalAlign: '-0.25em',
    },
  },
});

export type KbdProps = {
  /** The key: its name, a glyph, or an icon with a hidden name. */
  children: ReactNode;
};

/**
 * A key cap in running text: the command palette's key hints and the
 * composer's send-key hint draw keys the same way.
 */
export function Kbd({ children }: KbdProps) {
  const classes = useStyles();
  return <kbd className={classes.kbd}>{children}</kbd>;
}
