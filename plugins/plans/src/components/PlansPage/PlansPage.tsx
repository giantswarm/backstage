import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import {
  Alert,
  Box,
  Select,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@backstage/ui';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { plansApiRef } from '../../apis';
import { ProposedTab } from '../ProposedTab';
import { MergedTab } from '../MergedTab';

/**
 * Plans viewer: proposed plans (open PRs, rendered from their head branch)
 * and merged plans (documents on the default branch), for the plan
 * repositories configured in `plans.repositories`.
 */
export function PlansPage() {
  const plansApi = useApi(plansApiRef);
  // The selected repository lives in `?repo=` (the same param the review
  // page uses), so it survives navigating into a PR and back and the list
  // URL is shareable.
  const [searchParams, setSearchParams] = useSearchParams();
  const repo = searchParams.get('repo') ?? undefined;
  // Deep links to a merged plan (`?plan=`, e.g. from the roadmap epic view)
  // land on the merged tab directly; after that the tab is uncontrolled UI
  // state that never needs to travel back to the URL.
  const defaultTab = searchParams.has('plan') ? 'merged' : 'proposed';

  // Functional update so this callback never depends on the current
  // `searchParams` identity and stays stable across renders (the repo Select
  // is memoized on it).
  const selectRepo = useCallback(
    (next: string) => {
      setSearchParams(
        prev => {
          const params = new URLSearchParams(prev);
          params.set('repo', next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['plans', 'repos'],
    queryFn: () => plansApi.listRepos(),
  });

  const repositories = useMemo(() => data?.repositories ?? [], [data]);
  const activeRepo =
    repo && repositories.includes(repo) ? repo : repositories[0];

  // The repository picker lives in the shared "Plans" PluginHeader (rendered by
  // the app's PageLayout), injected via the header-actions slot rather than a
  // toolbar in the page body. The review page provides no actions, so the slot
  // clears automatically when this page unmounts.
  const headerActions = useMemo(
    () =>
      repositories.length > 0 ? (
        <Select
          aria-label="Repository"
          options={repositories.map(repository => ({
            id: repository,
            label: repository,
          }))}
          selectedKey={activeRepo ?? null}
          onSelectionChange={key => key && selectRepo(String(key))}
        />
      ) : null,
    [repositories, activeRepo, selectRepo],
  );
  useProvidePageHeaderActions(headerActions);

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
        <Alert
          status="danger"
          title="Failed to load plan repositories"
          description={(error as Error).message}
        />
      </Content>
    );
  }

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

  return (
    <Content>
      <Tabs defaultSelectedKey={defaultTab}>
        <TabList>
          <Tab id="proposed">Proposed</Tab>
          <Tab id="merged">Merged</Tab>
        </TabList>
        <TabPanel id="proposed">
          <Box pt="4">
            <ProposedTab repo={activeRepo} />
          </Box>
        </TabPanel>
        <TabPanel id="merged">
          <Box pt="4">
            <MergedTab repo={activeRepo} />
          </Box>
        </TabPanel>
      </Tabs>
    </Content>
  );
}
