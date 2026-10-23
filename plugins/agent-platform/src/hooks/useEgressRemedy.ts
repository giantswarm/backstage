import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  HelmRelease,
  useSelfSubjectAccessReview,
  type HarnessRuntime,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import {
  useAgentManagerAvailability,
  useAgentManagerInfo,
} from './useAgentManager';
import { useAgentManagerAgent } from './useAgentManagerAgent';
import { useHarnessChoices } from './useHarnessChoices';
import { useNewSessionHref } from './useNewSessionHref';
import {
  egressRemedyKind,
  type EgressRemedy,
  type EgressRemedyFacts,
} from '../lib/egressRemedy';
import { harnessTitle, runtimeLabel } from '../lib/harnesses';
import { TOOLCHAINS_CAPABILITY } from '../lib/toolchainManager';
import {
  agentDetailRouteRef,
  agentEditRouteRef,
  toolchainsRouteRef,
} from '../routes';

const NO_INSTALLATIONS: string[] = [];

/**
 * The remedy an egress refusal's alert offers for the Session's agent
 * (`egressRemedyKind`). Read only once the timeline shows a refusal
 * (`enabled`), as the signed-in person: the agent's Harness runtime from the
 * fleet's row (or the namespace's Harnesses), agent-manager's `get_agent` and
 * `get_info`, and whether the person may update the agent's HelmRelease, as
 * the agent's page asks it.
 */
export function useEgressRemedy(options: {
  installation: string;
  /** The agent's identity; unknown until the Session is joined to its agent. */
  agent: { namespace: string; name: string } | undefined;
  /**
   * The agent's Harness as the fleet's row has it; absent where no row
   * matched. A runtime the row has not read is looked up here.
   */
  harness?: { name?: string; title?: string; runtime?: HarnessRuntime };
  enabled: boolean;
}): EgressRemedy {
  const { installation, agent, harness, enabled } = options;
  const namespace = agent?.namespace ?? '';
  const name = agent?.name ?? '';
  const active = enabled && Boolean(agent);

  const availability = useAgentManagerAvailability(
    active ? [installation] : NO_INSTALLATIONS,
  );
  const presence = availability.presenceOf(installation);
  const reachable = active && presence === 'available';
  const managerRead = useAgentManagerAgent(installation, namespace, name, {
    enabled: reachable,
  });
  const managerAgent = managerRead.agent;
  const { info, isLoading: isInfoLoading } = useAgentManagerInfo(
    reachable ? installation : undefined,
  );

  // The runtime the fleet's row has not read: the namespace's Harnesses, the
  // one the agent names (none names the platform's).
  const needsHarnesses = active && !harness?.runtime;
  const {
    choices,
    platformHarness,
    isLoading: isHarnessLoading,
  } = useHarnessChoices(
    needsHarnesses ? installation : undefined,
    needsHarnesses ? namespace : undefined,
  );

  // A live write runs as the person against the agent's HelmRelease, so the
  // API server answers whether they may make it (the agent page's question).
  const asksAccess =
    reachable &&
    managerAgent?.managed === 'helmrelease' &&
    info?.identity !== 'serviceAccount';
  const updateAccess = useSelfSubjectAccessReview(
    installation,
    {
      group: HelmRelease.group,
      resource: HelmRelease.plural,
      namespace: managerAgent?.helmRelease?.namespace ?? namespace,
      name: managerAgent?.helmRelease?.name ?? name,
      verb: 'update',
    },
    { enabled: asksAccess },
  );

  const agentDetailRoute = useRouteRef(agentDetailRouteRef);
  const agentEditRoute = useRouteRef(agentEditRouteRef);
  const toolchainsRoute = useRouteRef(toolchainsRouteRef);
  const newSessionHref = useNewSessionHref();

  if (!active) {
    return { kind: 'pending' };
  }

  // agent-manager's reading: pending while muster's server list or the read
  // is in flight, `null` where it is not reached or could not read the agent.
  let agentFact: EgressRemedyFacts['agent'];
  if (presence === 'unknown') {
    agentFact = availability.isLoading ? undefined : null;
  } else if (!reachable) {
    agentFact = null;
  } else if (managerRead.isLoading) {
    agentFact = undefined;
  } else {
    agentFact = managerAgent ?? null;
  }

  let runtime: EgressRemedyFacts['runtime'];
  let title: string | undefined = harness?.title;
  if (harness?.runtime) {
    runtime = harness.runtime;
  } else {
    let harnessName: string | undefined;
    if (harness) {
      harnessName = harness.name ?? platformHarness;
    } else if (managerAgent) {
      harnessName = managerAgent.harness ?? platformHarness;
    }
    const choice = harnessName
      ? choices.find(candidate => candidate.name === harnessName)
      : undefined;
    if (choice?.runtime) {
      runtime = choice.runtime;
      title = harnessTitle(choice);
    } else if (
      isHarnessLoading ||
      (reachable && isInfoLoading) ||
      (!harnessName && agentFact === undefined)
    ) {
      runtime = undefined;
    } else {
      runtime = null;
    }
  }

  const settled = !reachable || !isInfoLoading;
  const kind = egressRemedyKind({
    runtime,
    agent: agentFact,
    toolchains: settled
      ? Boolean(info?.capabilities?.[TOOLCHAINS_CAPABILITY])
      : undefined,
    canCommit: settled ? info?.capabilities?.commit === true : undefined,
    mayUpdate:
      asksAccess && updateAccess.isLoading
        ? undefined
        : !asksAccess || updateAccess.allowed,
  });

  const identity = { installation, namespace, name };
  const runtimeName = title ?? runtimeLabel(runtime ?? undefined);
  switch (kind) {
    case 'toolchains':
      return {
        kind,
        runtime: runtimeName,
        toolchainsHref: toolchainsRoute?.(),
        newSessionHref: newSessionHref?.({
          id: `${installation}/${namespace}/${name}`,
        }),
      };
    case 'platform':
      return { kind, runtime: runtimeName };
    case 'ask-editor':
      return { kind, agentHref: agentDetailRoute?.(identity) };
    case 'edit':
      return { kind, editHref: agentEditRoute?.(identity) };
    default:
      return { kind };
  }
}
