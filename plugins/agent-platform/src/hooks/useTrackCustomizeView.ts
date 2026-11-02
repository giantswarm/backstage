import { useEffect, useMemo, useState } from 'react';
import {
  countBucketOrUnknown,
  type CountBucketOrUnknown,
  type PortalEvent,
  useTrackedView,
} from '@giantswarm/backstage-plugin-analytics-react';
import type { RouteTabCount } from '@giantswarm/backstage-plugin-ui-react';

import { useCustomizeData } from '../components/CustomizeDataProvider';
import { useScopedToolchainCount } from './useToolchainManager';

/**
 * How long the Customize page's view signal waits for its counts: a count
 * still being read then is sent as `unknown`, so a read that never settles
 * cannot hold the signal back for as long as the page stays open.
 */
export const CUSTOMIZE_VIEW_DEADLINE_MS = 30_000;

/** What muster's provider counts, which this plugin cannot read itself. */
export type MusterViewCounts = {
  connectors?: RouteTabCount;
  workflows?: RouteTabCount;
};

/** A count's bucket, or undefined while it is still being read in time. */
function bucketOf(
  count: RouteTabCount | undefined,
  isOverdue: boolean,
): CountBucketOrUnknown | undefined {
  if (count === 'loading') {
    return isOverdue ? 'unknown' : undefined;
  }
  // Not read (a failure, a sign-in in the way) is unknown, never 0.
  return countBucketOrUnknown(count);
}

/**
 * The Customize page's view event: how many agents, skills, connectors,
 * models, workflows, workspaces and toolchains it counts for the
 * installations in scope. Undefined until every count is read, or
 * {@link CUSTOMIZE_VIEW_DEADLINE_MS} has passed.
 *
 * The counts are the tab strip's once complete (`settledCounts`: every
 * installation in scope answered, and an unread one makes the count
 * unknown rather than short), plus the toolchains the Toolchains tab lists,
 * read here in that tab's cached read since the strip does not count them. Connectors and workflows are muster's (its Connectors tab counts
 * every sub-tab), passed in by the page, which mounts muster's provider.
 */
export function useCustomizeViewEvent(
  muster: MusterViewCounts,
): PortalEvent | undefined {
  const { settledCounts: counts } = useCustomizeData();
  const toolchains = useScopedToolchainCount();
  const [isOverdue, setOverdue] = useState(false);
  useEffect(() => {
    const timer = setTimeout(
      () => setOverdue(true),
      CUSTOMIZE_VIEW_DEADLINE_MS,
    );
    return () => clearTimeout(timer);
  }, []);

  const agents = bucketOf(counts.agents, isOverdue);
  const skills = bucketOf(counts.skills, isOverdue);
  const connectors = bucketOf(muster.connectors, isOverdue);
  const models = bucketOf(counts.models, isOverdue);
  const workflows = bucketOf(muster.workflows, isOverdue);
  const workspaces = bucketOf(counts.workspaces, isOverdue);
  const toolchainBucket = bucketOf(toolchains, isOverdue);

  // Memoized on the buckets, so a poll that changes nothing they say hands
  // the tracker the same event.
  return useMemo(
    () =>
      agents &&
      skills &&
      connectors &&
      models &&
      workflows &&
      workspaces &&
      toolchainBucket
        ? {
            name: 'AgentPlatform.customizeViewed',
            attributes: {
              agents,
              skills,
              connectors,
              models,
              workflows,
              workspaces,
              toolchains: toolchainBucket,
            },
          }
        : undefined,
    [
      agents,
      skills,
      connectors,
      models,
      workflows,
      workspaces,
      toolchainBucket,
    ],
  );
}

/**
 * Reports the Customize page's view once per opening, not per tab: the page
 * keeps the providers, and so this hook, mounted across its tabs.
 */
export function useTrackCustomizeView(muster: MusterViewCounts): void {
  useTrackedView(useCustomizeViewEvent(muster));
}
