import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Grid,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Paper,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { EmptyState, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { plansApiRef } from '../../apis';
import { compareDisplayPaths, isRenderableFile } from '../../lib/files';
import { EpicAssignees } from '../EpicAssignees';
import { EpicChip } from '../EpicChip';
import { EpicSubIssues } from '../EpicSubIssues';
import { PlanFileContent } from '../PlanFileContent';
import { useEpicListItemStyles } from '../epicListItemStyles';

const ROOT_GROUP = '(repository root)';

const useStyles = makeStyles((theme: Theme) => ({
  listPanel: {
    padding: 0,
  },
  detailPanel: {
    padding: theme.spacing(2),
  },
  fileSection: {
    marginTop: theme.spacing(2),
    '&:first-child': {
      marginTop: 0,
    },
  },
  fileName: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: 600,
    marginBottom: theme.spacing(1),
  },
}));

interface PlanGroup {
  name: string;
  files: string[];
}

/**
 * Merged plans: renderable documents on the default branch, grouped by their
 * top-level folder (one folder per plan by convention; loose root documents
 * are grouped under a synthetic root entry).
 */
export function MergedTab({ repo }: { repo: string }) {
  const classes = useStyles();
  const epicClasses = useEpicListItemStyles();
  const plansApi = useApi(plansApiRef);
  // The selected plan lives in `?plan=` so the roadmap epic view (and
  // anyone with the URL) can deep-link a specific plan.
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get('plan') ?? undefined;
  const selectPlan = (name: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('plan', name);
    setSearchParams(params, { replace: true });
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['plans', 'tree', repo],
    queryFn: () => plansApi.getTree(undefined, repo),
  });

  // Epic references per plan folder, for the cross-link chips. Failure just
  // means no chips (e.g. the backend still rolling out).
  const { data: epicsData } = useQuery({
    queryKey: ['plans', 'epics', repo],
    queryFn: () => plansApi.listEpics(repo),
    retry: false,
  });
  const epicByFolder = useMemo(
    () =>
      new Map((epicsData?.merged ?? []).map(entry => [entry.folder, entry])),
    [epicsData],
  );

  const groups = useMemo<PlanGroup[]>(() => {
    const byFolder = new Map<string, string[]>();
    for (const entry of data?.tree ?? []) {
      if (entry.type !== 'blob' || !entry.path) {
        continue;
      }
      if (!isRenderableFile(entry.path)) {
        continue;
      }
      const slash = entry.path.indexOf('/');
      const folder = slash === -1 ? ROOT_GROUP : entry.path.slice(0, slash);
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), entry.path]);
    }
    return [...byFolder.entries()]
      .map(([name, files]) => ({
        name,
        files: [...files].sort(compareDisplayPaths),
      }))
      .sort((a, b) => {
        if (a.name === ROOT_GROUP) return 1;
        if (b.name === ROOT_GROUP) return -1;
        return a.name.localeCompare(b.name);
      });
  }, [data]);

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return <Alert severity="error">{(error as Error).message}</Alert>;
  }
  if (groups.length === 0) {
    return (
      <EmptyState
        missing="content"
        title="No merged plans"
        description={`No plan documents were found on the default branch of ${repo}.`}
      />
    );
  }

  const selectedGroup =
    groups.find(group => group.name === selected) ?? groups[0];

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={4}>
        <Paper className={classes.listPanel} variant="outlined">
          <List disablePadding>
            {groups.map(group => (
              <ListItem
                key={group.name}
                className={epicClasses.planItem}
                button
                divider
                selected={group.name === selectedGroup.name}
                onClick={() => selectPlan(group.name)}
              >
                <ListItemText
                  primary={group.name}
                  secondary={`${group.files.length} document${
                    group.files.length === 1 ? '' : 's'
                  }`}
                />
                {epicByFolder.has(group.name) && (
                  <EpicAssignees epic={epicByFolder.get(group.name)!.epic} />
                )}
                {epicByFolder.has(group.name) && (
                  <ListItemSecondaryAction className={epicClasses.epicAction}>
                    <EpicChip epic={epicByFolder.get(group.name)!.epic} />
                  </ListItemSecondaryAction>
                )}
              </ListItem>
            ))}
          </List>
        </Paper>
      </Grid>
      <Grid item xs={12} md={8}>
        <Paper className={classes.detailPanel} variant="outlined">
          {data?.truncated && (
            <Alert severity="warning">
              The repository tree was truncated by GitHub; some documents may be
              missing.
            </Alert>
          )}
          {epicByFolder.has(selectedGroup.name) && (
            <EpicSubIssues epic={epicByFolder.get(selectedGroup.name)!.epic} />
          )}
          {selectedGroup.files.map(path => (
            <Box key={path} className={classes.fileSection}>
              {selectedGroup.files.length > 1 && (
                <Typography className={classes.fileName}>{path}</Typography>
              )}
              <PlanFileContent repo={repo} refName="HEAD" path={path} />
            </Box>
          ))}
        </Paper>
      </Grid>
    </Grid>
  );
}
