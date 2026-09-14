import { Grid } from '@backstage/ui';
import {
  Agent,
  isGitOpsManaged,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { GitOpsCard } from '@giantswarm/backstage-plugin-flux-react';

import { AgentConfigurationCard } from './AgentConfigurationCard';
import { AgentStatusCard } from './AgentStatusCard';
import { AgentSystemPromptCard } from './AgentSystemPromptCard';
import type { ClientServingSummary } from '../../lib/serving';

/**
 * What the agent is and whether it works: where it came from, how it is
 * configured, what the controllers make of it, and the prompt it runs with.
 *
 * The tools it can reach, the skills mounted into it and the sessions held with
 * it each have a tab of their own.
 */
export function AgentOverviewTab({
  agent,
  installation,
  modelConfig,
  modelServing,
}: {
  agent: Agent;
  installation: string;
  modelConfig: ModelConfig | undefined;
  modelServing: ClientServingSummary | undefined;
}) {
  return (
    <>
      {/* A cheap pre-check only: no Flux or Helm marker at all means there is
          nothing to resolve, so skip the lookups entirely. Whether the agent is
          *actually* GitOps-managed is the card's own decision — it walks
          Agent → HelmRelease → Kustomization → GitRepository and renders nothing
          unless that ends in Git. An agent created by this plugin's own flow is
          reconciled by a HelmRelease the scaffolder applied, which is not in Git,
          so it correctly shows no card; the "Deployed by" row below is the whole
          truth about where it came from. */}
      {isGitOpsManaged(agent) && (
        <GitOpsCard resource={agent} installationName={installation} />
      )}

      {/* Status sits in a third of the width, beside the configuration. A
          controller message is prose — a rejected spec can carry several
          hundred words of admission-webhook output — and across the full page
          it runs to line lengths nobody can follow. A narrower column is the
          fix, so the status card is the one thing that does not want the whole
          width. The system prompt below it does, and takes it. One column below
          `lg`, where there is no width to divide. */}
      {/* Document order is the layout order — no `colStart`. Grid's sparse
          auto-placement moves the cursor to the next row whenever an item's
          definite column-start is before the cursor's current column, so
          placing the status in column 3 first and then pinning the
          configuration to column 1 drops the configuration to a second row and
          leaves the top-left of the page empty.

          The consequence is that stacking below `lg` puts the configuration
          above the status. Acceptable: the readiness label is already in the
          page header, so the state is visible before either card. */}
      <Grid.Root columns={{ initial: '1', lg: '3' }} gap="4">
        <Grid.Item colSpan={{ initial: '1', lg: '2' }}>
          <AgentConfigurationCard
            agent={agent}
            modelConfig={modelConfig}
            modelServing={modelServing}
          />
        </Grid.Item>
        <Grid.Item colSpan="1">
          <AgentStatusCard agent={agent} />
        </Grid.Item>
      </Grid.Root>

      <AgentSystemPromptCard agent={agent} />
    </>
  );
}
