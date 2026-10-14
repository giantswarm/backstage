import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useRailInset } from '../../RailWidthProvider';
import { RailResizeHandle } from '../RailResizeHandle';

/** The rail's id, which its resize handle names as what it resizes. */
export const RAIL_ID = 'agent-shell-rail';

const useStyles = makeStyles({
  rail: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 1000,
    background: 'var(--agent-shell-rail-bg, var(--bui-bg-neutral-1))',
    borderRight: '1px solid var(--bui-border-1)',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
});

/**
 * The desktop rail's landmark, as wide as `useRailInset` says, which is also
 * where the content region starts, and the handle that resizes it. The only
 * part of the rail that reads the width, so a drag re-renders the frame and
 * not the items and session lists it holds.
 */
export function RailFrame({
  resizable,
  children,
}: {
  resizable: boolean;
  children: ReactNode;
}) {
  const classes = useStyles();
  const width = useRailInset();
  return (
    <>
      <nav
        id={RAIL_ID}
        aria-label="Main"
        className={classes.rail}
        style={{ width }}
      >
        {children}
      </nav>
      {resizable && <RailResizeHandle controls={RAIL_ID} />}
    </>
  );
}
