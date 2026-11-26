import { useState } from 'react';
import { Alert, AccordionGroup, Flex, Skeleton, Text } from '@backstage/ui';
import { useSimpleAccordionStyles } from '@giantswarm/backstage-plugin-ui-react';

import { useMyTeams } from '../../hooks/useMyTeams';
import {
  useGithubInstallation,
  useMusterPluginApi,
  useReviewsClient,
} from '../../hooks/useReviewsClient';
import { useReviewSections } from '../../hooks/useReviewSections';
import { useHiveTeamScope, useTabParams } from '../../hooks/useTabParams';
import { ConnectGitHubAlert } from '../ConnectGitHubAlert';
import { FiltersBar } from '../FiltersBar';
import { RateLimitAlert, useIsBefore } from '../RateLimitAlert';
import { ReviewSection } from '../ReviewSection';
import { defaultChannelOf } from '../../lib/slack';

/**
 * Hive's Reviews tab: the PRs waiting on the person, on their teams and on
 * the team Hive is scoped to, and their own PRs waiting for review, read
 * from GitHub through muster as the person.
 */
export function ReviewsTab() {
  const musterApi = useMusterPluginApi();
  if (!musterApi) {
    return (
      <Alert
        status="warning"
        title="This portal has no muster"
        description="The Reviews tab reads GitHub through the muster plugin, which this portal does not run."
      />
    );
  }
  return <ReviewsTabContent />;
}

function ReviewsTabContent() {
  const github = useGithubInstallation();
  if (github.isLoading) {
    return <Skeleton width="100%" height={160} />;
  }
  if (!github.installation) {
    return (
      <Alert
        status="warning"
        title="No muster here reaches GitHub"
        description={
          github.error?.message ??
          'None of the muster installations this portal reaches lists a github connector.'
        }
      />
    );
  }
  return (
    <ReviewsLists
      installation={github.installation}
      serverName={github.serverName}
    />
  );
}

function ReviewsLists({
  installation,
  serverName,
}: {
  installation: string;
  serverName: string;
}) {
  const client = useReviewsClient(installation);
  const myTeams = useMyTeams();
  const hiveTeam = useHiveTeamScope(myTeams.teams);
  const params = useTabParams();
  const state = useReviewSections(
    myTeams.isLoading ? undefined : client,
    params.filters,
    hiveTeam,
    myTeams.teams,
    params.search,
  );
  const isRateLimited = useIsBefore(state.rateLimit?.resetAt);
  const spacing = useSimpleAccordionStyles();

  // Sections the person opened or closed; the others are open when they
  // hold PRs, so an empty one stays collapsed.
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());
  const expanded = new Set(
    state.sections
      .filter(
        section =>
          toggled.get(section.key) ??
          (section.rows !== undefined && section.rows.length > 0),
      )
      .map(section => section.key),
  );

  // Every search failed for a reason of its own: one alert, not a row of
  // sections that say "Not read".
  const failed = state.sections.filter(section => section.error);
  if (
    !state.notConnected &&
    !state.rateLimit &&
    failed.length === state.sections.length &&
    failed.length > 0
  ) {
    return (
      <Alert
        status="danger"
        title="GitHub did not answer"
        description={failed[0].error!.message}
      />
    );
  }

  if (state.notConnected) {
    return (
      <ConnectGitHubAlert
        installation={installation}
        serverName={serverName}
        error={state.notConnected}
        onSignedIn={state.refresh}
      />
    );
  }

  return (
    <Flex direction="column" gap="4">
      <FiltersBar
        filters={params.filters}
        onFilterChange={params.setFilter}
        readAt={state.readAt}
        isRefreshing={state.isRefreshing}
        isRefreshDisabled={isRateLimited}
        onRefresh={state.refresh}
      />
      {state.rateLimit && (
        <RateLimitAlert
          resetAt={state.rateLimit.resetAt}
          message={state.rateLimit.message}
        />
      )}
      <AccordionGroup
        allowsMultiple
        className={spacing.group}
        expandedKeys={expanded}
        onExpandedChange={keys => {
          // Only the section the person opened or closed: the others keep
          // opening by themselves once their PRs arrive.
          const next = new Map(toggled);
          for (const section of state.sections) {
            const isOpen = (keys as Set<string>).has(section.key);
            if (isOpen !== expanded.has(section.key)) {
              next.set(section.key, isOpen);
            }
          }
          setToggled(next);
        }}
      >
        {state.sections.map(section => (
          <ReviewSection
            key={section.key}
            section={section}
            client={client}
            isExpanded={expanded.has(section.key)}
            requestedOf={state.requestedOf}
            statusOn={params.statusOn.has(section.key)}
            onStatusChange={on => params.setStatusOn(section.key, on)}
            sort={params.sortFor(section.key)}
            onSortChange={sort => params.setSort(section.key, sort)}
            slackPost={
              section.kind === 'mine'
                ? { defaultChannel: defaultChannelOf(hiveTeam, myTeams.teams) }
                : undefined
            }
          />
        ))}
      </AccordionGroup>
      <Text variant="body-small" color="secondary">
        Read from GitHub as you, through {installation}'s muster. A row opens
        the PR on GitHub.
      </Text>
    </Flex>
  );
}
