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
import type { AgentManagerInfo } from '../lib/agentManager';
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
 * (`enabled`), as the signed-in person, and only where muster lists
 * agent-manager: the agent's Harness runtime from the fleet's row (or the
 * namespace's Harnesses), agent-manager's `get_agent` and `get_info`, and
 * whether the person may update the agent's HelmRelease, as the agent's page
 * asks it. Each is `pending` until read, so the alert shows no remedy rather
 * than one it takes back; one that cannot be read gives the neutral remedy.
 */
export function useEgressRemedy(options: {
  installation: string;
  /** The agent's identity; unknown until the Session is joined to its agent. */
  agent: { namespace: string; name: string } | undefined;
  /**
   * The fleet's row for the agent, where one matched: its id (what New
   * session preselects) and its Harness, by name (none for an inline one)
   * and runtime once read. A runtime the row has not read is looked up here.
   */
  row?: {
    id: string;
    harness?: string;
    harnessTitle?: string;
    harnessRuntime?: HarnessRuntime;
  };
  enabled: boolean;
}): EgressRemedy {
  const { installation, agent, row, enabled } = options;
  const namespace = agent?.namespace ?? '';
  const name = agent?.name ?? '';
  const active = enabled && Boolean(agent);

  const availability = useAgentManagerAvailability(
    active ? [installation] : NO_INSTALLATIONS,
  );
  const presence = availability.presenceOf(installation);
  // muster's server list not in yet: nothing is settled.
  const isListing = presence === 'unknown' && availability.isLoading;
  const reachable = active && presence === 'available';
  const managerRead = useAgentManagerAgent(installation, namespace, name, {
    enabled: reachable,
  });
  const managerAgent = managerRead.agent;
  const infoRead = useAgentManagerInfo(reachable ? installation : undefined);

  // `get_info`: pending while listed or read, `null` where agent-manager is
  // not reached or the read failed.
  let info: AgentManagerInfo | null | undefined;
  if (isListing) {
    info = undefined;
  } else if (!reachable) {
    info = null;
  } else if (infoRead.isLoading) {
    info = undefined;
  } else {
    info = infoRead.info && !infoRead.error ? infoRead.info : null;
  }

  // The runtime the fleet's row has not read: the namespace's Harnesses.
  // Not asked where agent-manager is not reached, since every remedy then is
  // the neutral one.
  const needsHarnesses = reachable && !row?.harnessRuntime;
  const {
    choices,
    platformHarness,
    isLoading: isHarnessLoading,
  } = useHarnessChoices(
    needsHarnesses ? installation : undefined,
    needsHarnesses ? namespace : undefined,
  );

  // A live write runs as the person against the agent's HelmRelease, so the
  // API server answers whether they may make it (the agent page's question),
  // unless agent-manager writes as its ServiceAccount: asked once `get_info`
  // has said which.
  const asksAccess =
    reachable &&
    managerAgent?.managed === 'helmrelease' &&
    Boolean(info) &&
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

  // agent-manager's reading: pending while listed or read, `null` where it is
  // not reached or could not read the agent.
  let agentFact: EgressRemedyFacts['agent'];
  if (isListing) {
    agentFact = undefined;
  } else if (!reachable) {
    agentFact = null;
  } else if (managerRead.isLoading) {
    agentFact = undefined;
  } else {
    agentFact = managerAgent ?? null;
  }

  // The runtime: the row's, else the namespace's Harness the agent names. A
  // row without a Harness name runs an inline Harness whose runtime it did
  // not read: unknown, never the platform's. Without a row, agent-manager's
  // reading names the Harness, none being the platform's.
  let runtime: EgressRemedyFacts['runtime'];
  let title = row?.harnessTitle;
  if (row?.harnessRuntime) {
    runtime = row.harnessRuntime;
  } else if (isListing) {
    runtime = undefined;
  } else if (!reachable) {
    runtime = null;
  } else {
    let harnessName: string | null | undefined;
    if (row) {
      harnessName = row.harness ?? null;
    } else if (managerAgent) {
      harnessName = managerAgent.harness ?? platformHarness;
    } else {
      harnessName = agentFact === undefined ? undefined : null;
    }
    const choice = harnessName
      ? choices.find(candidate => candidate.name === harnessName)
      : undefined;
    if (choice?.runtime) {
      runtime = choice.runtime;
      title = harnessTitle(choice);
    } else if (harnessName === null) {
      runtime = null;
    } else if (
      harnessName === undefined ||
      isHarnessLoading ||
      infoRead.isLoading
    ) {
      runtime = undefined;
    } else {
      runtime = null;
    }
  }

  let mayUpdate: EgressRemedyFacts['mayUpdate'];
  if (info === undefined) {
    mayUpdate = undefined;
  } else if (info === null) {
    mayUpdate = null;
  } else if (!asksAccess) {
    mayUpdate = true;
  } else {
    mayUpdate = updateAccess.isLoading ? undefined : updateAccess.allowed;
  }

  const capability = (key: string) => {
    if (info === undefined || info === null) {
      return info;
    }
    return info.capabilities?.[key] === true;
  };
  const kind = egressRemedyKind({
    runtime,
    agent: agentFact,
    toolchains: capability(TOOLCHAINS_CAPABILITY),
    canCommit: capability('commit'),
    mayUpdate,
  });

  const identity = { installation, namespace, name };
  const runtimeName = title ?? runtimeLabel(runtime ?? undefined);
  switch (kind) {
    case 'toolchains':
      return {
        kind,
        runtime: runtimeName,
        toolchainsHref: toolchainsRoute?.(),
        newSessionHref: row ? newSessionHref?.({ id: row.id }) : undefined,
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
