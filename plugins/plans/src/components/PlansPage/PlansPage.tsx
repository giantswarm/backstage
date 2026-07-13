import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { Alert } from '@material-ui/lab';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { plansApiRef } from '../../apis';
import { ProposedTab } from '../ProposedTab';
import { MergedTab } from '../MergedTab';

const useStyles = makeStyles((theme: Theme) => ({
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  repoPicker: {
    marginLeft: 'auto',
    minWidth: 280,
  },
  tabBody: {
    paddingTop: theme.spacing(1),
  },
}));

/**
 * Plans viewer: proposed plans (open PRs, rendered from their head branch)
 * and merged plans (documents on the default branch), for the plan
 * repositories configured in `plans.repositories`.
 */
export function PlansPage() {
  const classes = useStyles();
  const plansApi = useApi(plansApiRef);
  // The selected repository lives in `?repo=` (the same param the review
  // page uses), so it survives navigating into a PR and back and the list
  // URL is shareable.
  const [searchParams, setSearchParams] = useSearchParams();
  const repo = searchParams.get('repo') ?? undefined;
  // Deep links to a merged plan (`?plan=`, e.g. from the roadmap epic view)
  // land on the merged tab directly.
  const [tab, setTab] = useState<'proposed' | 'merged'>(
    searchParams.has('plan') ? 'merged' : 'proposed',
  );

  const selectRepo = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('repo', next);
    setSearchParams(params, { replace: true });
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['plans', 'repos'],
    queryFn: () => plansApi.listRepos(),
  });

  if (isLoading) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }
  if (error) {
    return (
      <Content>
        <Alert severity="error">{(error as Error).message}</Alert>
      </Content>
    );
  }

  const repositories = data?.repositories ?? [];
  if (repositories.length === 0) {
    return (
      <Content>
        <EmptyState
          missing="content"
          title="No plan repositories configured"
          description="Set plans.repositories in the app configuration to point this page at one or more plan repositories."
        />
      </Content>
    );
  }

  const activeRepo =
    repo && repositories.includes(repo) ? repo : repositories[0];

  return (
    <Content>
      <Box className={classes.toolbar}>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          indicatorColor="primary"
        >
          <Tab label="Proposed" value="proposed" />
          <Tab label="Merged" value="merged" />
        </Tabs>
        {/* Always visible, even with a single repository: the repo name is
            what tells the user whose plans they are looking at. */}
        <TextField
          className={classes.repoPicker}
          select
          size="small"
          variant="outlined"
          label="Repository"
          value={activeRepo}
          onChange={event => selectRepo(event.target.value)}
        >
          {repositories.map(repository => (
            <MenuItem key={repository} value={repository}>
              {repository}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Box className={classes.tabBody}>
        {tab === 'proposed' ? (
          <ProposedTab repo={activeRepo} />
        ) : (
          <MergedTab repo={activeRepo} />
        )}
      </Box>
    </Content>
  );
}
