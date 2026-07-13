import { DragEvent, useState } from 'react';
import {
  Box,
  Chip,
  Paper,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { EmptyState, Progress } from '@backstage/core-components';
import { RoadmapField, RoadmapItemFilters } from '../../apis';
import { useItems, useUpdateStatus } from '../../hooks';
import { groupByStatus, NO_STATUS, statusColumns } from '../../lib/board';
import { ItemCard } from './ItemCard';

const COLUMN_WIDTH = 300;

const useStyles = makeStyles((theme: Theme) => ({
  board: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(2),
    overflowX: 'auto',
    paddingBottom: theme.spacing(2),
  },
  column: {
    width: COLUMN_WIDTH,
    flexShrink: 0,
    padding: theme.spacing(1.5),
    backgroundColor: theme.palette.background.default,
  },
  columnDropTarget: {
    outline: `2px dashed ${theme.palette.primary.main}`,
    outlineOffset: -2,
  },
  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1.5),
  },
  columnTitle: {
    fontSize: 14,
    fontWeight: 600,
  },
  countChip: {
    height: 20,
    fontSize: 11,
  },
  columnBody: {
    minHeight: theme.spacing(6),
  },
  mutationError: {
    marginBottom: theme.spacing(2),
  },
}));

/**
 * The status-column board (goal: oversight). Cards move between columns by
 * drag and drop or via the per-card status menu; both write through the
 * caller's GitHub token so the mutation is attributed to them.
 */
export function BoardView(props: {
  filters: RoadmapItemFilters;
  schemaFields: RoadmapField[];
}) {
  const { filters, schemaFields } = props;
  const classes = useStyles();
  const [dropColumn, setDropColumn] = useState<string | null>(null);
  const { data, isLoading, error } = useItems(filters);
  const updateStatus = useUpdateStatus();

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return <Alert severity="error">{(error as Error).message}</Alert>;
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        missing="content"
        title="No board items"
        description="No roadmap items match the current filters."
      />
    );
  }

  const columns = statusColumns(schemaFields);
  const groups = groupByStatus(items, columns);
  // Items whose status is not a known column (or missing) still need a home.
  const extraColumns = [...groups.keys()].filter(
    column => !columns.includes(column),
  );
  const visibleColumns = [...columns, ...extraColumns];

  const moveTo = (itemId: string, status: string) => {
    // The synthetic bucket is not a real status option; cards can leave it
    // but not enter it.
    if (status !== NO_STATUS) {
      updateStatus.moveTo(itemId, status);
    }
  };

  const onDrop = (event: DragEvent, column: string) => {
    event.preventDefault();
    setDropColumn(null);
    const itemId = event.dataTransfer.getData('text/plain');
    if (itemId) {
      moveTo(itemId, column);
    }
  };

  return (
    <>
      {updateStatus.error ? (
        <Alert
          className={classes.mutationError}
          severity="error"
          onClose={() => updateStatus.reset()}
        >
          Failed to update status: {(updateStatus.error as Error).message}
        </Alert>
      ) : null}
      <Box className={classes.board}>
        {visibleColumns.map(column => {
          const columnItems = groups.get(column) ?? [];
          return (
            <Paper
              key={column}
              className={`${classes.column} ${
                dropColumn === column ? classes.columnDropTarget : ''
              }`}
              variant="outlined"
              onDragOver={event => {
                if (column !== NO_STATUS) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropColumn(column);
                }
              }}
              onDragLeave={() =>
                setDropColumn(current => (current === column ? null : current))
              }
              onDrop={event => onDrop(event, column)}
            >
              <Box className={classes.columnHeader}>
                <Typography className={classes.columnTitle}>
                  {column}
                </Typography>
                <Chip
                  className={classes.countChip}
                  size="small"
                  label={columnItems.length}
                />
              </Box>
              <Box className={classes.columnBody}>
                {columnItems.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    columns={columns}
                    onMove={moveTo}
                  />
                ))}
              </Box>
            </Paper>
          );
        })}
      </Box>
    </>
  );
}
