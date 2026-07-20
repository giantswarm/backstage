import {
  Chip,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Paper,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Link as RouterLink } from 'react-router-dom';
import { Alert } from '@material-ui/lab';
import { EmptyState, Progress } from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import { useQueries, useQuery } from '@tanstack/react-query';
import { plansApiRef } from '../../apis';
import { formatDate } from '../../lib/dates';
import { pullRouteRef } from '../../routes';
import { EpicAssignees } from '../EpicAssignees';
import { EpicChip } from '../EpicChip';
import { useEpicListItemStyles } from '../epicListItemStyles';

const useStyles = makeStyles((theme: Theme) => ({
  listPanel: {
    padding: 0,
  },
  draftChip: {
    marginLeft: theme.spacing(1),
  },
}));

/**
 * Open pull requests against the plan repository -- plans proposed for team
 * review. A full-width list; selecting a PR navigates to its review page
 * (`/plans/pr/:number?repo=...`), which is where documents are read and
 * commented on.
 */
export function ProposedTab({ repo }: { repo: string }) {
  const classes = useStyles();
  const epicClasses = useEpicListItemStyles();
  const plansApi = useApi(plansApiRef);
  const pullLink = useRouteRef(pullRouteRef);

  const { data, isLoading, error } = useQuery({
    queryKey: ['plans', 'pulls', repo],
    queryFn: () => plansApi.listPulls(repo),
  });

  const pulls = data?.pulls ?? [];

  // Epic references per open PR, for the cross-link chips. Failure just
  // means no chips.
  const { data: epicsData } = useQuery({
    queryKey: ['plans', 'epics', repo],
    queryFn: () => plansApi.listEpics(repo),
    retry: false,
  });
  const epicByPull = new Map(
    (epicsData?.pulls ?? []).map(entry => [entry.number, entry]),
  );

  // Changed-file counts for the list. Same query keys as the review page,
  // so opening a PR reuses these cache entries instead of refetching.
  const fileQueries = useQueries({
    queries: pulls.map(pull => ({
      queryKey: ['plans', 'pull-files', repo, pull.number],
      queryFn: () => plansApi.listPullFiles(pull.number, repo),
    })),
  });

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return <Alert severity="error">{(error as Error).message}</Alert>;
  }

  if (pulls.length === 0) {
    return (
      <EmptyState
        missing="content"
        title="No proposed plans"
        description={`There are no open pull requests in ${repo}.`}
      />
    );
  }

  return (
    <Paper className={classes.listPanel} variant="outlined">
      <List disablePadding>
        {pulls.map((pull, index) => {
          const fileCount = fileQueries[index]?.data?.files.length;
          const updated = formatDate(pull.updatedAt);
          const secondary = [
            `#${pull.number}`,
            pull.author,
            fileCount !== undefined
              ? `${fileCount} file${fileCount === 1 ? '' : 's'} changed`
              : undefined,
            updated ? `updated ${updated}` : undefined,
          ]
            .filter(Boolean)
            .join(' · ');
          const to = `${pullLink?.({ number: String(pull.number) }) ?? '#'}?repo=${encodeURIComponent(repo)}`;

          return (
            <ListItem
              key={pull.number}
              className={epicClasses.planItem}
              button
              divider
              component={RouterLink}
              to={to}
            >
              <ListItemText
                primary={
                  <>
                    {pull.title}
                    {pull.draft && (
                      <Chip
                        className={classes.draftChip}
                        size="small"
                        label="Draft"
                      />
                    )}
                  </>
                }
                secondary={secondary}
              />
              {epicByPull.has(pull.number) && (
                <EpicAssignees epic={epicByPull.get(pull.number)!.epic} />
              )}
              {epicByPull.has(pull.number) && (
                <ListItemSecondaryAction className={epicClasses.epicAction}>
                  <EpicChip epic={epicByPull.get(pull.number)!.epic} />
                </ListItemSecondaryAction>
              )}
            </ListItem>
          );
        })}
      </List>
    </Paper>
  );
}
