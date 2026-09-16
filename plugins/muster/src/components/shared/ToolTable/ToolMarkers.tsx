import { makeStyles, Theme } from '@material-ui/core';
import { ToolAnnotations } from '../../../apis';
import { isDestructive, isReadOnly } from '../../../lib/toolAnnotations';

const useStyles = makeStyles((theme: Theme) => ({
  markers: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
  },
  marker: {
    fontSize: 11,
    lineHeight: 1.4,
    padding: theme.spacing(0, 0.75),
    borderRadius: 999,
    border: `1px solid ${theme.palette.divider}`,
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap',
  },
  destructive: {
    borderColor: theme.palette.error.main,
    color: theme.palette.error.main,
  },
}));

export interface ToolMarkersProps {
  annotations?: ToolAnnotations;
}

/**
 * The read-only / destructive markers a server puts on its tool (MCP tool
 * annotations, forwarded by muster), so an author picks with understanding and
 * a viewer sees what an agent's tools can do.
 *
 * Renders nothing for a tool whose server declares neither — which is most of
 * them. {@link ToolTable} drops the whole column when no row in a list has a
 * marker, so an unannotated catalogue costs no width.
 */
export function ToolMarkers({ annotations }: ToolMarkersProps) {
  const classes = useStyles();
  const readOnly = isReadOnly({ annotations });
  const destructive = isDestructive({ annotations });

  if (!readOnly && !destructive) {
    return null;
  }

  return (
    <span className={classes.markers}>
      {readOnly && <span className={classes.marker}>read-only</span>}
      {destructive && (
        <span className={`${classes.marker} ${classes.destructive}`}>
          destructive
        </span>
      )}
    </span>
  );
}

/** Whether {@link ToolMarkers} would render anything for these annotations. */
export function hasMarkers(annotations?: ToolAnnotations): boolean {
  return isReadOnly({ annotations }) || isDestructive({ annotations });
}
