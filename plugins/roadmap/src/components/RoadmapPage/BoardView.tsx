import { Box, Paper, Typography, makeStyles, Theme } from '@material-ui/core';
import { BoardItem } from '../../apis';
import { groupByField, STATUS_FIELD } from '../../lib/board';
import { ItemCard } from './ItemCard';

const useStyles = makeStyles((theme: Theme) => ({
  board: {
    display: 'flex',
    gap: theme.spacing(2),
    alignItems: 'flex-start',
    overflowX: 'auto',
    paddingBottom: theme.spacing(2),
  },
  column: {
    minWidth: 280,
    maxWidth: 320,
    flex: '1 0 280px',
    padding: theme.spacing(1.5),
    backgroundColor: theme.palette.background.default,
  },
  columnHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: theme.spacing(1.5),
  },
  count: {
    color: theme.palette.text.secondary,
  },
}));

/**
 * Kanban-style board: one column per Status option (in board schema order,
 * i.e. the status lifecycle). The status select on each card moves it
 * between columns.
 */
export function BoardView({
  items,
  statusOptions,
  onStatusChange,
}: {
  items: BoardItem[];
  statusOptions: string[];
  onStatusChange: (item: BoardItem, status: string) => void;
}) {
  const classes = useStyles();
  const columns = groupByField(items, statusOptions, STATUS_FIELD).filter(
    column => statusOptions.includes(column.value) || column.items.length > 0,
  );

  return (
    <Box className={classes.board}>
      {columns.map(column => (
        <Paper key={column.value} variant="outlined" className={classes.column}>
          <Box className={classes.columnHeader}>
            <Typography variant="subtitle2">{column.value}</Typography>
            <Typography variant="caption" className={classes.count}>
              {column.items.length}
            </Typography>
          </Box>
          {column.items.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              statusOptions={statusOptions}
              onStatusChange={onStatusChange}
            />
          ))}
        </Paper>
      ))}
    </Box>
  );
}
