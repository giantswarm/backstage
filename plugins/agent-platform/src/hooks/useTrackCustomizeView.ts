import { useMemo } from 'react';
import {
  type PortalEvent,
  useTrackedView,
} from '@giantswarm/backstage-plugin-analytics-react';
import type { RouteTabCount } from '@giantswarm/backstage-plugin-ui-react';

import { useCustomizeData } from '../components/CustomizeDataProvider';
import { useScopedToolchainCount } from './useToolchainManager';

/** What muster's provider counts, which this plugin cannot read itself. */
export type MusterViewCounts = {
  connectors?: RouteTabCount;
  workflows?: RouteTabCount;
};

type CustomizeViewCounts = Record<
  | 'agents'
  | 'skills'
  | 'connectors'
  | 'models'
  | 'workflows'
  | 'workspaces'
  | 'toolchains',
  RouteTabCount | undefined
>;

/**
 * The Customize page's view event: how many agents, skills, connectors,
 * models, workflows, workspaces and toolchains it counts for the
 * installations in scope. Undefined until every count has finished loading,
 * however long that takes; a count that could not be read (`undefined`) is
 * left out of the event, never sent as a partial total.
 *
 * The counts are the tab strip's once complete (`settledCounts`: every
 * installation in scope answered), plus the toolchains the Toolchains tab
 * lists, read here in that tab's cached read since the strip does not count
 * them. Connectors and workflows are muster's (its Connectors tab counts
 * every sub-tab), passed in by the page, which mounts muster's provider.
 */
export function useCustomizeViewEvent(
  muster: MusterViewCounts,
): PortalEvent | undefined {
  const { settledCounts } = useCustomizeData();
  const toolchains = useScopedToolchainCount();
  const counts: CustomizeViewCounts = {
    agents: settledCounts.agents,
    skills: settledCounts.skills,
    connectors: muster.connectors,
    models: settledCounts.models,
    workflows: muster.workflows,
    workspaces: settledCounts.workspaces,
    toolchains,
  };
  const isLoading = Object.values(counts).some(count => count === 'loading');
  // A string key of what is known, so a poll that changes nothing hands the
  // tracker the same event.
  const key = isLoading ? '' : JSON.stringify(counts);

  return useMemo(() => {
    if (!key) {
      return undefined;
    }
    const known = Object.fromEntries(
      Object.entries(JSON.parse(key) as Record<string, number | null>).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number',
      ),
    );
    return { name: 'AgentPlatform.customizeViewed', attributes: known };
  }, [key]);
}

/**
 * Reports the Customize page's view once per opening, not per tab: the page
 * keeps the providers, and so this hook, mounted across its tabs.
 */
export function useTrackCustomizeView(muster: MusterViewCounts): void {
  useTrackedView(useCustomizeViewEvent(muster));
}
