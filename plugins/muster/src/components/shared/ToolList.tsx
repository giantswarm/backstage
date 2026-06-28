import { Box, Typography, makeStyles, Theme } from '@material-ui/core';

const useStyles = makeStyles((theme: Theme) => ({
  list: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    overflow: 'hidden',
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: theme.spacing(1, 1.5),
    [theme.breakpoints.up('sm')]: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: theme.spacing(1.5),
    },
    '&:not(:last-child)': {
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
  },
  clickable: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  name: {
    flexShrink: 0,
    fontFamily: 'monospace',
    fontSize: 13,
    color: theme.palette.text.primary,
  },
  description: {
    color: theme.palette.text.secondary,
  },
  empty: {
    padding: theme.spacing(2),
    color: theme.palette.text.secondary,
  },
}));

export interface ToolListItem {
  name: string;
  description?: string;
}

export interface ToolListProps {
  tools: ToolListItem[];
  /** When provided, rows become clickable (e.g. open in the tool explorer). */
  onSelect?: (name: string) => void;
  emptyText?: string;
}

/**
 * The mockups' tool list: a bordered, divided list of monospace tool names
 * with muted descriptions. Optionally clickable to drill into a tool.
 */
export function ToolList({ tools, onSelect, emptyText }: ToolListProps) {
  const classes = useStyles();

  if (tools.length === 0) {
    return (
      <Typography variant="body2" className={classes.empty}>
        {emptyText ?? 'No tools.'}
      </Typography>
    );
  }

  return (
    <Box className={classes.list}>
      {tools.map(tool => (
        <Box
          key={tool.name}
          className={
            onSelect ? `${classes.row} ${classes.clickable}` : classes.row
          }
          onClick={onSelect ? () => onSelect(tool.name) : undefined}
        >
          <code className={classes.name}>{tool.name}</code>
          {tool.description && (
            <Typography variant="body2" className={classes.description}>
              {tool.description}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}
