import { useMemo } from 'react';
import type { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  countBucket,
  countBucketOrUnknown,
  type PortalEvent,
} from '@giantswarm/backstage-plugin-analytics-react';

import {
  type DeclaredToolset,
  isGatewayBinding,
  MUSTER_MCP_SERVER_NAME,
  toolsetShape,
} from '../lib/toolset';
import type { AgentToolset } from './useAgentToolset';
import {
  type ToolsetResolution,
  useToolsetResolution,
} from './useToolsetResolution';

/** A count still being read; `undefined` is one that cannot be known. */
const READING = 'reading';

type ToolCount = number | undefined | typeof READING;

/**
 * The selectors to ask muster about: the declared toolset, as the Tools tab
 * asks. None where there is nothing to resolve, and none for an agent that
 * declares no toolset: the Tools tab does not resolve that one either, and
 * a muster call made only for usage data is not worth its count.
 */
function selectorsToResolve(declared: DeclaredToolset | undefined): string[] {
  return declared?.state === 'declared' &&
    toolsetShape(declared.selectors) !== 'none'
    ? declared.selectors
    : [];
}

/** The tools the gateway gives the agent through the viewer, as muster says. */
function gatewayToolCount(
  toolset: AgentToolset,
  resolution: ToolsetResolution,
): ToolCount {
  const { declared } = toolset;
  if (declared.state === 'no-gateway') {
    return 0;
  }
  if (declared.state === 'unresolved') {
    return toolset.isReading ? READING : undefined;
  }
  if (declared.state === 'implicit-full') {
    // Everything the gateway gives the viewer, which nothing on the page
    // resolves (see `selectorsToResolve`).
    return undefined;
  }
  if (
    declared.state === 'declared' &&
    toolsetShape(declared.selectors) === 'none'
  ) {
    return 0;
  }
  switch (resolution.status) {
    case 'resolved':
      return resolution.tools.length;
    case 'loading':
      return READING;
    case 'idle':
      // An empty declaration: nothing to resolve.
      return 0;
    default:
      // No muster plugin, a muster that predates toolsets, a refused or
      // failed resolution: the page cannot say either.
      return undefined;
  }
}

/**
 * The tools of servers the agent binds directly, not through the gateway:
 * the ones each binding lists. Unknown when a binding lists none, which
 * allows every tool of its server, a number only that server knows.
 */
function directToolCount(agent: Agent): number | undefined {
  let count = 0;
  for (const binding of agent.getMcpBindings()) {
    if (isGatewayBinding(agent, binding, MUSTER_MCP_SERVER_NAME)) {
      continue;
    }
    if (!binding.tools?.length) {
      return undefined;
    }
    count += binding.tools.length;
  }
  return count;
}

/**
 * The agent page's view event: how many skills the agent has, and how many
 * tools it can call through the person viewing it. Undefined until both are
 * known, so the page reports it once they are.
 *
 * The tools are the Tools tab's: the agent's declared toolset as muster
 * resolves it in the viewer's own session (toolset ∩ their access, so a
 * connector they have not signed in to adds none), plus the tools it lists on
 * servers it binds directly. Selectors are not counted: one `server:` or
 * `preset:` selector stands for any number of tools. Resolved here in the
 * Tools tab's own cached read, so opening that tab afterwards reads nothing
 * again. An agent that declares no toolset reaches everything the gateway
 * gives the viewer, which the page never resolves: its tools are unknown.
 */
export function useAgentViewEvent(
  agent: Agent | undefined,
  toolset: AgentToolset | undefined,
): PortalEvent | undefined {
  const declared = toolset?.declared;
  const selectors = useMemo(() => selectorsToResolve(declared), [declared]);
  const resolution = useToolsetResolution(agent?.cluster, selectors);

  const gateway =
    agent && toolset ? gatewayToolCount(toolset, resolution) : READING;
  const direct = agent ? directToolCount(agent) : undefined;
  const skillCount = agent?.getSkillCount();

  // Memoized on what it says, so a poll that changes nothing hands the
  // tracker the same event.
  return useMemo(() => {
    if (gateway === READING || skillCount === undefined) {
      return undefined;
    }
    const tools =
      gateway === undefined || direct === undefined
        ? undefined
        : gateway + direct;
    return {
      name: 'AgentPlatform.agentViewed',
      attributes: {
        skills: countBucket(skillCount),
        tools: countBucketOrUnknown(tools),
      },
    };
  }, [gateway, direct, skillCount]);
}
