import type {
  Harness,
  HarnessRuntime,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import type { AgentManagerInfo } from './agentManager';

/** agent-manager's platform Harness when `get_info` has not answered. */
export const DEFAULT_PLATFORM_HARNESS = 'kagent';

/**
 * The words for an agent's Harness wherever a person reads it: the create and
 * edit form's runtime field, its review and the agent page's facts, so the
 * two read the same.
 */
export const RUNTIME_LABEL = 'Runtime';
/** The technical term beside {@link RUNTIME_LABEL}. */
export const RUNTIME_TERM = 'Harness';
/** What the runtime is, in one sentence. */
export const RUNTIME_DESCRIPTION = 'What runs the agent.';
/** The mark on the platform Harness, the one a request naming none gets. */
export const PLATFORM_DEFAULT_LABEL = 'Platform default';

/**
 * The platform Harness agent-manager composes when a request names none:
 * `get_info`'s, else {@link DEFAULT_PLATFORM_HARNESS} while it has not
 * answered. Right for what a request will get; a page that marks a Harness
 * as the platform's reads `info?.harness?.name` alone, so it never marks one
 * on a guess.
 */
export function platformHarnessOf(
  info: Pick<AgentManagerInfo, 'harness'> | undefined,
): string {
  return info?.harness?.name || DEFAULT_PLATFORM_HARNESS;
}

/**
 * A Harness an agent can be created on, as the wizard offers it. The name is
 * what `create_agent` takes as `harness` and what the Agent object carries in
 * `spec.harnessRef.name`.
 */
export type HarnessChoice = {
  name: string;
  /** The Harness's `ui.giantswarm.io/display-name`, when an admin set one. */
  displayName?: string;
  runtime?: HarnessRuntime;
  /** The image's repository name, without registry, tag or digest. */
  imageName?: string;
};

const RUNTIME_LABELS: Record<HarnessRuntime, string> = {
  kagent: 'Declarative (Go ADK)',
  claude: 'Claude Code',
  codex: 'Codex',
  byo: 'Custom image',
};

/**
 * Whether a Harness runtime runs a coding CLI (every runtime but kagent's): an
 * agent on one reaches its Harness's platform list only, so it picks no
 * EgressPolicy. Undefined, the runtime is not known yet.
 */
export function isCodingRuntime(runtime: HarnessRuntime | undefined): boolean {
  return runtime !== undefined && runtime !== 'kagent';
}

export function runtimeLabel(runtime: HarnessRuntime | undefined): string {
  return runtime ? RUNTIME_LABELS[runtime] : 'Unknown runtime';
}

/**
 * What a person calls the Harness: its display name, else its runtime family.
 * Two Harnesses of one family (Claude Code with two toolchains, say) read the
 * same without a display name; the Harness name beneath tells them apart.
 */
export function harnessTitle(choice: HarnessChoice): string {
  return choice.displayName ?? runtimeLabel(choice.runtime);
}

/**
 * The platform Harness in one line, as a summary row reads it: its title and
 * the platform default's mark, or the mark alone until (or unless) it is read.
 */
export function platformRuntimeLine(choice: HarnessChoice | undefined): string {
  return choice
    ? `${harnessTitle(choice)} · ${PLATFORM_DEFAULT_LABEL}`
    : PLATFORM_DEFAULT_LABEL;
}

/** `gsoci.azurecr.io/giantswarm/kagent/claude-harness@sha256:…` → `claude-harness`. */
export function imageNameOf(image: string | undefined): string | undefined {
  const repository = image?.split('@')[0];
  const last = repository?.split('/').pop();
  return last?.replace(/:[^:]*$/, '') || undefined;
}

export function harnessChoiceOf(harness: Harness): HarnessChoice {
  return {
    name: harness.getName(),
    ...(harness.getDisplayNameAnnotation() && {
      displayName: harness.getDisplayNameAnnotation(),
    }),
    runtime: harness.getRuntime(),
    imageName: imageNameOf(harness.getImage()),
  };
}

/**
 * The Harnesses of `namespace` an agent can be created on: every one of them,
 * since an Agent names its Harness and nothing admits by label any more. The
 * platform one first, the rest by name.
 */
export function harnessChoicesOf(
  harnesses: readonly Harness[],
  namespace: string,
  platformHarness: string,
): HarnessChoice[] {
  return harnesses
    .filter(harness => harness.getNamespace() === namespace)
    .map(harnessChoiceOf)
    .sort(
      (a, b) =>
        Number(b.name === platformHarness) -
          Number(a.name === platformHarness) || a.name.localeCompare(b.name),
    );
}

/**
 * The origins the platform lets agents on a coding Harness reach: agent-manager's
 * chart value `harness.egress.<harness>`, which it writes for every agent on
 * that Harness and holds requested origins to (`guardCoding`). agent-manager
 * does not report it yet (proposed as `get_info.harnessEgress`, keyed by
 * Harness name, giantswarm/giantswarm#38814), so this answers `undefined` and
 * the agent form says only that the platform sets the agent's network access.
 * Once it does, read it here: the form lists what this returns.
 */
export function platformEgressOf(
  _info: AgentManagerInfo | undefined,
  _harness: string | undefined,
): string[] | undefined {
  return undefined;
}
