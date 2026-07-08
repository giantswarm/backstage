import {
  Box,
  Chip,
  Grid,
  Paper,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { BoardItem } from '../../apis';
import {
  ACTIVE_STATUSES,
  groupByAssignee,
  groupByField,
  STATUS_FIELD,
} from '../../lib/board';
import { ItemCard } from './ItemCard';

const useStyles = makeStyles((theme: Theme) => ({
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  assigneePanel: {
    padding: theme.spacing(1.5),
  },
  assigneeHeader: {
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
 * "Who is working on what": items in the active statuses (In Progress,
 * Validation) grouped by assignee. Unassigned active work is called out
 * explicitly -- it is a process smell, not a rendering detail. The status
 * distribution summary answers "what is this team doing" at a glance.
 */
export function TeamView({
  items,
  statusOptions,
  onStatusChange,
}: {
  items: BoardItem[];
  statusOptions: string[];
  onStatusChange: (item: BoardItem, status: string) => void;
}) {
  const classes = useStyles();

  const distribution = groupByField(items, statusOptions, STATUS_FIELD).filter(
    group => group.items.length > 0,
  );
  const activeItems = items.filter(item =>
    ACTIVE_STATUSES.includes(item.fields[STATUS_FIELD]),
  );
  const byAssignee = groupByAssignee(activeItems);
  const unassigned = byAssignee.find(group => group.assignee === '');

  return (
    <Box>
      <Box className={classes.summary}>
        {distribution.map(group => (
          <Chip
            key={group.value}
            size="small"
            variant="outlined"
            label={`${group.value} ${group.items.length}`}
          />
        ))}
      </Box>
      {unassigned && (
        <Box mb={2}>
          <Alert severity="warning">
            {unassigned.items.length} active item
            {unassigned.items.length === 1 ? ' has' : 's have'} no assignee.
          </Alert>
        </Box>
      )}
      {activeItems.length === 0 && (
        <Typography color="textSecondary">
          No items are currently in {ACTIVE_STATUSES.join(' or ')}.
        </Typography>
      )}
      <Grid container spacing={2} alignItems="flex-start">
        {byAssignee.map(group => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={group.assignee || '∅'}>
            <Paper variant="outlined" className={classes.assigneePanel}>
              <Box className={classes.assigneeHeader}>
                <Typography variant="subtitle2">
                  {group.assignee || 'Unassigned'}
                </Typography>
                <Typography variant="caption" className={classes.count}>
                  {group.items.length}
                </Typography>
              </Box>
              {group.items.map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  statusOptions={statusOptions}
                  onStatusChange={onStatusChange}
                />
              ))}
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
