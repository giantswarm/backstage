import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  root: {
    border: '1px solid var(--bui-border-1)',
    borderRadius: 12,
    padding: theme.spacing(1.5, 2),
  },
  summary: {
    cursor: 'pointer',
    color: 'var(--bui-fg-primary)',
  },
  defaults: {
    color: 'var(--bui-fg-secondary)',
    fontSize: '0.875rem',
    // A long technical name must wrap rather than widen the page at 375px.
    overflowWrap: 'anywhere',
  },
  body: {
    marginTop: theme.spacing(2),
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2.5),
  },
}));

export type MoreOptionsProps = {
  /** Controlled, so a blocked submit can open it on a field inside. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * What the folded fields are set to now, one short line after the label —
   * e.g. "technical name sonnet-4-5" — so the defaults are never a surprise.
   */
  summary?: ReactNode;
  children: ReactNode;
};

/**
 * "More options": the technical knobs of a create or edit flow, folded away
 * under the plain fields because their defaults fit most cases (the agent
 * wizard's first step introduced it). A native `<details>`, so the fields
 * inside stay mounted while it is closed. A page whose submit is blocked by a
 * field in here opens it in the same handler as `useFieldValidation`'s
 * `reveal()`, so the field saying what is wrong is never out of sight.
 */
export function MoreOptions({
  open,
  onOpenChange,
  summary,
  children,
}: MoreOptionsProps) {
  const classes = useStyles();
  return (
    <details
      className={classes.root}
      open={open}
      onToggle={event =>
        onOpenChange((event.currentTarget as HTMLDetailsElement).open)
      }
    >
      <summary className={classes.summary}>
        More options
        {summary ? (
          <>
            {' '}
            <span className={classes.defaults}>· {summary}</span>
          </>
        ) : null}
      </summary>
      <div className={classes.body}>{children}</div>
    </details>
  );
}
