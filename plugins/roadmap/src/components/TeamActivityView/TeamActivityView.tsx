import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { EmptyState, Progress } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { RoadmapItem, RoadmapItemFilters } from '../../apis';
import { useItems } from '../../hooks';
import { formatDate } from '../../lib/dates';
import {
  findStatusOption,
  groupByAssignee,
  KIND_FIELD,
  STATUS_FIELD,
} from '../../lib/board';
import { itemRouteRef } from '../../routes';

/**
 * The statuses that mean "someone is actively on this". Status names carry
 * emoji suffixes on the board (e.g. "In Progress ⛏️"), so they are matched
 * by keyword via findStatusOption.
 */
const ACTIVE_STATUS_KEYWORDS = ['In Progress', 'Validation'];

const RECENT_WINDOW = '>@today-7d';

const UNASSIGNED = 'Unassigned';

const useStyles = makeStyles((theme: Theme) => ({
  summary: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(3),
  },
  section: {
    marginBottom: theme.spacing(3),
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  statusChip: {
    height: 20,
    fontSize: 11,
  },
  itemTitle: {
    fontSize: 14,
  },
}));

function isActive(item: RoadmapItem): boolean {
  const status = item.fields[STATUS_FIELD];
  return (
    !!status &&
    ACTIVE_STATUS_KEYWORDS.some(keyword =>
      findStatusOption([status], keyword),
    )
  );
}

function ItemList(props: { items: RoadmapItem[] }) {
  const classes = useStyles();
  const itemLink = useRouteRef(itemRouteRef);
  return (
    <Paper variant="outlined">
      <List dense disablePadding>
        {props.items.map(item => {
          const updated = formatDate(item.updatedAt);
          const secondary = [
            item.repo ? `${item.repo}#${item.number ?? ''}` : 'draft item',
            item.fields[KIND_FIELD],
            updated ? `updated ${updated}` : undefined,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <ListItem
              key={item.id}
              button
              divider
              component={RouterLink}
              to={itemLink?.({ id: item.id }) ?? '#'}
            >
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center" gridGap={8}>
                    <span className={classes.itemTitle}>{item.title}</span>
                    {item.fields[STATUS_FIELD] && (
                      <Chip
                        className={classes.statusChip}
                        size="small"
                        variant="outlined"
                        label={item.fields[STATUS_FIELD]}
                      />
                    )}
                  </Box>
                }
                secondary={secondary}
              />
            </ListItem>
          );
        })}
      </List>
    </Paper>
  );
}

/**
 * "Who is working on what" (goal: communication): active items grouped by
 * assignee -- with unassigned in-flight work called out as a smell -- plus
 * status counts and the items that moved in the last week.
 */
export function TeamActivityView(props: { filters: RoadmapItemFilters }) {
  const { filters } = props;
  const classes = useStyles();

  const allItems = useItems(filters);
  const recentItems = useItems({ ...filters, updated: RECENT_WINDOW });

  if (allItems.isLoading) {
    return <Progress />;
  }
  if (allItems.error) {
    return <Alert severity="error">{(allItems.error as Error).message}</Alert>;
  }

  const items = allItems.data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        missing="content"
        title="No board items"
        description="No roadmap items match the current filters."
      />
    );
  }

  const statusCounts = new Map<string, number>();
  for (const item of items) {
    const status = item.fields[STATUS_FIELD] ?? 'No status';
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }

  const { groups: activeGroups, unassigned } = groupByAssignee(
    items.filter(isActive),
  );
  const recent = recentItems.data?.items ?? [];

  return (
    <>
      <Box className={classes.summary}>
        {[...statusCounts.entries()].map(([status, count]) => (
          <Chip
            key={status}
            size="small"
            variant="outlined"
            label={`${status}: ${count}`}
          />
        ))}
      </Box>

      {activeGroups.length === 0 && unassigned.length === 0 && (
        <Box className={classes.section}>
          <Typography variant="body2" color="textSecondary">
            Nothing is currently in progress or in validation.
          </Typography>
        </Box>
      )}
      {activeGroups.map(({ assignee, items: assigneeItems }) => (
        <Box key={assignee} className={classes.section}>
          <Box className={classes.sectionHeader}>
            <Typography variant="h6">@{assignee}</Typography>
            <Chip size="small" label={assigneeItems.length} />
          </Box>
          <ItemList items={assigneeItems} />
        </Box>
      ))}
      {unassigned.length > 0 && (
        <Box className={classes.section}>
          <Box className={classes.sectionHeader}>
            <Typography variant="h6">{UNASSIGNED}</Typography>
            <Chip size="small" label={unassigned.length} />
            <Chip
              size="small"
              variant="outlined"
              color="secondary"
              label="in flight without an owner"
            />
          </Box>
          <ItemList items={unassigned} />
        </Box>
      )}

      <Box className={classes.section}>
        <Box className={classes.sectionHeader}>
          <Typography variant="h6">Recently moved</Typography>
          <Typography variant="body2" color="textSecondary">
            updated in the last 7 days
          </Typography>
        </Box>
        {recentItems.isLoading && <Progress />}
        {recentItems.error ? (
          <Alert severity="error">
            {(recentItems.error as Error).message}
          </Alert>
        ) : null}
        {!recentItems.isLoading && recent.length === 0 && (
          <Typography variant="body2" color="textSecondary">
            Nothing moved in the last week.
          </Typography>
        )}
        {recent.length > 0 && <ItemList items={recent} />}
      </Box>
    </>
  );
}
