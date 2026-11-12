import type { HarnessRuntime } from '@giantswarm/backstage-plugin-kubernetes-react';

import type { AgentManagerAgent } from './agentManager';
import { isOriginScheme } from './egressRefusals';
import { isCodingRuntime } from './harnesses';

/**
 * What a person can do about an egress refusal in a Session, by what was
 * refused and what the agent is (giantswarm/giantswarm#38814):
 *
 * - `tcp`: a raw TCP destination, or any other that is not HTTP(S). kagent's
 *   egress declares HTTP and HTTPS origins only, and agent-manager's
 *   per-Harness egress is a list of origins too, so no one can allow it, on
 *   any runtime: no link, no one to ask.
 * - `toolchains`: a coding Harness reaches the platform's list for it only
 *   (agent-manager's `guardCoding`), and the installation's Sessions mount
 *   toolchains, whose images declare the origins their tools need.
 * - `platform`: a coding Harness without toolchains; only the platform team
 *   can widen its list.
 * - `git`: the agent is defined in Git where the portal cannot change it.
 * - `ask-editor`: the portal can change it, but not as this person.
 * - `edit`: the person can add the origin on the agent's edit page.
 * - `neutral`: the agent could not be read; nothing is promised.
 * - `pending`: still being read; no remedy is shown rather than a wrong one.
 */
export type EgressRemedyKind =
  | 'pending'
  | 'neutral'
  | 'tcp'
  | 'toolchains'
  | 'platform'
  | 'git'
  | 'ask-editor'
  | 'edit';

/** What the alert under a refusal offers, with the links it needs. */
export type EgressRemedy =
  | { kind: 'pending' | 'neutral' | 'tcp' | 'git' }
  | {
      kind: 'toolchains';
      /** The Harness as a person names it (`harnessTitle`). */
      runtime: string;
      /** The Customize screen's Toolchains tab. */
      toolchainsHref?: string;
      /** New session with this agent preselected, where its toolchains are picked. */
      newSessionHref?: string;
    }
  | { kind: 'platform'; runtime: string }
  | { kind: 'ask-editor'; agentHref?: string }
  | { kind: 'edit'; editHref?: string };

/**
 * The remedy for a refused destination by its scheme (`http`, `https`, `tcp`
 * or another label the gateway gives), for the Session's agent
 * (`useEgressRemedy`).
 */
export type EgressRemedyFor = (scheme: string) => EgressRemedy;

/**
 * Whether the remedy for a refused destination depends on the agent: only an
 * HTTP(S) origin can be allowed by an egress setting, so every other scheme
 * gets the `tcp` remedy whatever the agent is. `egressRemedyKind`,
 * `unknownAgentRemedy` and whether the Session page reads the agent at all
 * go by this one test, so they change together.
 */
export function remedyNeedsAgent(scheme: string): boolean {
  return isOriginScheme(scheme);
}

/**
 * The remedy where nothing is known of the agent: the `tcp` one, which needs
 * nothing of it, else the neutral one, which promises nothing.
 */
export const unknownAgentRemedy: EgressRemedyFor = scheme =>
  remedyNeedsAgent(scheme) ? { kind: 'neutral' } : { kind: 'tcp' };

/**
 * What is known about the agent, each `undefined` while it is being read and
 * `null` where it could not be (agent-manager not on the installation, or its
 * read failed): a remedy that needs it is then the neutral one.
 */
export type EgressRemedyFacts = {
  /**
   * The refused destination's scheme: `http`, `https`, `tcp`, or another
   * label the gateway gives, which is treated as `tcp`.
   */
  scheme: string;
  /** The runtime of the agent's Harness. */
  runtime: HarnessRuntime | null | undefined;
  /** agent-manager's `get_agent`, as the person. */
  agent:
    | Pick<AgentManagerAgent, 'namespace' | 'managed' | 'helmRelease'>
    | null
    | undefined;
  /** `get_info`'s `toolchains` capability: Sessions mount toolchains. */
  toolchains: boolean | null | undefined;
  /** `get_info`'s `commit` capability: an agent from Git is edited by pull request. */
  canCommit: boolean | null | undefined;
  /**
   * Whether the person may update the agent's HelmRelease
   * (`SelfSubjectAccessReview`); `true` where it is not asked.
   */
  mayUpdate: boolean | null | undefined;
};

/**
 * Whether an agent is defined in Git outside agent-manager's directory, where
 * no pull request of agent-manager's reaches it: applied from Git, with its
 * HelmRelease in another namespace than the agent's, which agent-manager never
 * writes (giantswarm/giantswarm#38813, proposal 2). A cheap signal from
 * `get_agent` alone; the commit dry run tells it exactly.
 */
export function isDefinedOutsideAgentManager(
  agent: Pick<AgentManagerAgent, 'namespace' | 'managed' | 'helmRelease'>,
): boolean {
  return (
    agent.managed === 'gitops' &&
    agent.helmRelease !== undefined &&
    agent.helmRelease.namespace !== agent.namespace
  );
}

/**
 * The remedy that applies, in the issue's order: raw TCP, or any scheme
 * but HTTP(S), first (no egress setting allows it, whatever the agent is, so nothing about the agent is
 * waited for), then a coding Harness (its egress is the platform's, wherever
 * the agent is defined), then where the agent is defined and who may change
 * it. An unknown runtime promises nothing, since an origin added to a coding
 * agent is refused.
 */
export function egressRemedyKind(facts: EgressRemedyFacts): EgressRemedyKind {
  const { scheme, runtime, agent, toolchains, canCommit, mayUpdate } = facts;
  if (!remedyNeedsAgent(scheme)) {
    return 'tcp';
  }
  if (runtime === undefined) {
    return 'pending';
  }
  if (runtime === null) {
    return 'neutral';
  }
  if (isCodingRuntime(runtime)) {
    if (toolchains === undefined) {
      return 'pending';
    }
    if (toolchains === null) {
      return 'neutral';
    }
    return toolchains ? 'toolchains' : 'platform';
  }
  if (agent === undefined) {
    return 'pending';
  }
  // Neither a bare Agent nor the platform's own agent can be edited.
  if (
    agent === null ||
    agent.managed === 'none' ||
    agent.managed === 'platform'
  ) {
    return 'neutral';
  }
  if (agent.managed === 'gitops') {
    if (isDefinedOutsideAgentManager(agent)) {
      return 'git';
    }
    if (canCommit === undefined) {
      return 'pending';
    }
    if (canCommit === null) {
      return 'neutral';
    }
    // Edited through a pull request as the person, as the agent's page offers.
    return canCommit ? 'edit' : 'git';
  }
  if (mayUpdate === undefined) {
    return 'pending';
  }
  if (mayUpdate === null) {
    return 'neutral';
  }
  return mayUpdate ? 'edit' : 'ask-editor';
}
