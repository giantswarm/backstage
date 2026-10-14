import type { Query } from '@tanstack/react-query';
import {
  Agent,
  AgentReadiness,
  AgentInterface,
  deriveAgentReadiness,
  getAgentStatusChangedAt,
  Harness,
  isAgentTransitional,
  KubeObjectInterface,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ALL_INSTALLATIONS,
  installationsWithoutComponent,
  type InstallationInventoryEntry,
  type InstallationScope,
} from '@giantswarm/backstage-plugin-gs';
import { joinNames } from '@giantswarm/backstage-plugin-ui-react';
import {
  summarizeClientServing,
  type ClientServingState,
  type ClientServingSummary,
} from '../../lib/serving';
import { canonicalSkillId } from '../../lib/skills';
import {
  MUSTER_MCP_SERVER_NAME,
  toolsetOfAgent,
  type DeclaredToolset,
  type ToolsetCarrier,
} from '../../lib/toolset';
import { harnessChoiceOf, harnessTitle } from '../../lib/harnesses';

/**
 * Baseline poll for the fleet-wide agent list. Deliberately equal to the query
 * client's `staleTime` (see `QueryClientProvider`): interval refetches are *not*
 * gated by staleness, so a shorter interval would refetch data the client still
 * considers fresh and reintroduce exactly the background-refetch churn that
 * `staleTime` was set to avoid.
 *
 * This tier only exists to notice agents created, edited or deleted elsewhere
 * (kubectl, another tab, the scaffolder) — not to watch one converge, which is
 * what the transitional tier below is for.
 */
export const BASELINE_REFETCH_INTERVAL_MS = 60_000;

/**
 * Poll for an installation that has an agent still converging. Matches kagent's
 * own UI, and roughly the controller's reconcile cadence.
 */
export const TRANSITIONAL_REFETCH_INTERVAL_MS = 5_000;

/**
 * How long an agent may sit in a non-ready state before we stop treating it as
 * "converging" and let its installation fall back to the baseline.
 *
 * Without this bound a *permanently* broken agent — an unpullable image, a spec
 * the controller keeps rejecting — is transitional forever and would pin its
 * installation at the fast interval for as long as anyone leaves the tab open.
 * kagent's own UI has that bug. A healthy agent converges well inside this
 * window, and past it polling faster cannot help: the fix is a spec change,
 * which bumps the generation and starts the window again.
 */
const TRANSITIONAL_MAX_AGE_MS = 3 * 60_000;

/**
 * Whether one agent is worth re-checking sooner than the rest: not settled into a
 * healthy state, and its status still moving (or too new to tell).
 *
 * Shared by the fleet list and the single-agent detail page so both back off from
 * a *permanently* broken agent on the same terms — see
 * {@link TRANSITIONAL_MAX_AGE_MS} for why that bound exists.
 */
function isAgentConverging(json: AgentInterface, now: number): boolean {
  if (!isAgentTransitional(deriveAgentReadiness(json))) {
    return false;
  }

  const changedAt = getAgentStatusChangedAt(json);

  // No usable timestamp: treat the agent as just-changed rather than as stuck,
  // so a genuinely new agent is still picked up quickly.
  return changedAt === undefined || now - changedAt < TRANSITIONAL_MAX_AGE_MS;
}

/**
 * Refetch interval for a single agent, for the detail page.
 *
 * Same two tiers as the list below, decided from this one agent's own status: it
 * tightens while the agent is converging and relaxes once it settles or stays
 * broken. The detail page is exactly where someone watches an agent come up, so
 * the fast tier matters more here than in the list.
 */
export function getAgentRefetchInterval(
  query: Query<KubeObjectInterface>,
): number {
  const json = query.state.data as AgentInterface | undefined;
  if (!json) {
    return BASELINE_REFETCH_INTERVAL_MS;
  }

  return isAgentConverging(json, Date.now())
    ? TRANSITIONAL_REFETCH_INTERVAL_MS
    : BASELINE_REFETCH_INTERVAL_MS;
}

/**
 * Per-installation refetch interval for the agent list.
 *
 * `useResources` applies this to each installation's list query separately, and
 * react-query re-evaluates it after every fetch resolves — so this needs no
 * provider state and is self-correcting: an installation whose agents are all
 * ready stays on the baseline, and one whose agent starts converging tightens to
 * the fast interval and relaxes again once it settles.
 *
 * What this does **not** do is accelerate the first sighting of a *newly created*
 * agent. The decision is made from the data already in hand, so an installation
 * whose cached list predates the new agent stays on the baseline until the next
 * poll reveals it. Nothing invalidates the Agent list after creation (the flow
 * hands off to the scaffolder task page, and the agent does not exist yet at that
 * point), and `staleTime` suppresses a refetch on mount for a cache entry under a
 * minute old — so a new agent can take up to the baseline interval to appear, and
 * only then does the fast tier engage. Invalidating on creation would be the fix
 * if that wait proves annoying in practice.
 *
 * Note that interval refetches only fire while the tab is focused
 * (`refetchIntervalInBackground` defaults to `false`), which is the same
 * guard kagent's UI implements by hand with `document.hidden`.
 */
export function getAgentsRefetchInterval(
  query: Query<KubeObjectInterface[]>,
): number {
  const items = query.state.data;
  if (!items?.length) {
    return BASELINE_REFETCH_INTERVAL_MS;
  }

  const now = Date.now();

  // This query lists Agents, so its items are Agent JSON — narrow to read
  // the conditions the shared derivation expects.
  const isConverging = (items as AgentInterface[]).some(json =>
    isAgentConverging(json, now),
  );

  return isConverging
    ? TRANSITIONAL_REFETCH_INTERVAL_MS
    : BASELINE_REFETCH_INTERVAL_MS;
}

/**
 * A single agent flattened into a plain row for the table. Plain objects (not
 * `Agent` instances) so default sorting/rendering is trivial and the table
 * layer stays decoupled from the resource classes.
 */
export type AgentRow = {
  /** Stable unique key: installation + namespace + resource name. */
  id: string;
  installation: string;
  namespace: string;
  /** Display name (annotation) falling back to the resource name. */
  name: string;
  /**
   * Technical (DNS-1123) resource name. Seeds the deterministic avatar — the
   * avatar derives from the technical name, not the display name.
   */
  technicalName: string;
  description: string;
  /**
   * Human-readable model label resolved from the referenced ModelConfig: its
   * display name, else its `spec.model`, else its resource name. `undefined`
   * when the template references no model.
   */
  model?: string;
  /**
   * The ModelConfig's actual `spec.model` — `claude-opus-5`, not a display
   * label.
   *
   * Distinct from {@link model} on purpose. That one is for a reader and falls
   * back to other labels; this one has to match what a
   * provider and the gateway call the model (`gen_ai_response_model`), so it
   * is the ModelConfig's field verbatim or nothing. Pricing a session needs
   * this; a table column wants the other.
   */
  modelName?: string;
  /** `spec.harnessRef.name`; `undefined` for an inline Harness. */
  harness?: string;
  /** {@link harnessTitle} of that Harness, once it has been read. */
  harnessTitle?: string;
  skillCount: number;
  /**
   * The git-sourced skills the agent mounts, each as its
   * {@link canonicalSkillId} (`<repo URL>#<path>`), so a discovered skill can
   * be matched to the agents using it whatever form either URL is written
   * in. OCI and bucket skills have no catalog identity and are left out.
   */
  skillIds?: string[];
  /**
   * The commit each git skill in {@link skillIds} is pinned to, keyed by the
   * same canonical id — what a skill's page compares with the catalog's head
   * to tell which agents run an older version of it. Absent with `skillIds`.
   */
  skillPins?: Record<string, string>;
  /**
   * The referenced ModelConfig as `<installation>/<namespace>/<name>`, the id
   * a model row carries. `undefined` when the agent references no model.
   */
  modelConfigId?: string;
  /** Readiness derived from the Agent's conditions. */
  readiness: AgentReadiness;
  /**
   * Detail explaining a non-ready readiness (the Harness's reconcile error or
   * the unresolved reference), for the
   * status's info icon. `undefined` when there is nothing to explain.
   */
  readinessMessage?: string;
  /**
   * Compile downgrades the Harness reports — features it could not honour.
   * Independent of readiness: a ready agent can carry them.
   */
  warnings?: string[];
  /**
   * The toolset read off the agent's carrier `RemoteMCPServer`. Absent when
   * the row was built without the namespace's servers in hand.
   */
  toolset?: DeclaredToolset;
  /**
   * What the serving layer says about the model behind the agent's
   * ModelConfig — the served model's readiness, or that nothing answers for
   * it any more (`notServing`: the agent's turns fail). Independent of the
   * agent's own readiness: kagent deploys an agent happily whose model is
   * gone. `undefined` when the ModelConfig is unknown, points at an external
   * provider, or no serving layer is in view.
   */
  modelServing?: ClientServingSummary;
};

/**
 * The ModelConfig an agent's `spec.modelConfig` references, among
 * those on the same installation. ModelConfigs are namespaced and must live in
 * the agent's namespace, so both name and namespace are matched. `undefined`
 * when the agent references none, or it can't be found (unreadable, not yet
 * loaded, or on another installation).
 */
export function resolveModelConfig(
  agent: Agent,
  modelConfigs: ModelConfig[],
): ModelConfig | undefined {
  const ref = agent.getModelConfigName();
  if (!ref) {
    return undefined;
  }

  const namespace = agent.getNamespace();
  return modelConfigs.find(
    mc => mc.getName() === ref && mc.getNamespace() === namespace,
  );
}

/**
 * Resolve an agent's `spec.modelConfig` reference to a
 * human-readable label by joining against the ModelConfigs on the same
 * installation ({@link resolveModelConfig}).
 *
 * Falls back to the raw reference name when the ModelConfig can't be found,
 * and to `undefined` when the agent references no model at all.
 */
export function resolveModelLabel(
  agent: Agent,
  modelConfigs: ModelConfig[],
): string | undefined {
  const ref = agent.getModelConfigName();
  if (!ref) {
    return undefined;
  }
  return modelLabel(resolveModelConfig(agent, modelConfigs)) ?? ref;
}

/**
 * How a ModelConfig resolves to the serving layer —
 * `useServing().servingStateFor`, partially applied to the installation.
 */
export type ResolveModelServing = (
  modelConfig: ModelConfig,
) => ClientServingState | undefined;

/**
 * What a reader calls the model: the ModelConfig's display name, else the
 * model it configures, else its resource name.
 */
function modelLabel(modelConfig: ModelConfig | undefined): string | undefined {
  if (!modelConfig) {
    return undefined;
  }
  return (
    modelConfig.getDisplayNameAnnotation() ??
    modelConfig.getModel() ??
    modelConfig.getName()
  );
}

/**
 * Flatten an `Agent` into a plain {@link AgentRow}. With a
 * `resolveServing`, the row also carries the serving state of the model behind
 * the agent's ModelConfig; without one (no serving layer in view) it does not.
 * With `carriers` — the installation's `RemoteMCPServer`s — it carries the
 * toolset read off the agent's own carrier; without them it does not. With
 * `harnesses`, the installation's Harnesses, it carries its Harness's title.
 */
export function toAgentRow(
  agent: Agent,
  modelConfigs: ModelConfig[],
  resolveServing?: ResolveModelServing,
  carriers?: readonly ToolsetCarrier[],
  harnesses?: readonly Harness[],
): AgentRow {
  const installation = agent.cluster;
  const namespace = agent.getNamespace() ?? '';
  const name = agent.getName();
  const harnessName = agent.getHarnessName();
  const harness = harnesses?.find(
    candidate =>
      candidate.getNamespace() === namespace &&
      candidate.getName() === harnessName,
  );
  const modelConfig = resolveModelConfig(agent, modelConfigs);
  const serving =
    modelConfig && resolveServing ? resolveServing(modelConfig) : undefined;
  const warnings = agent.getHarnessWarnings();
  const modelConfigName = agent.getModelConfigName();
  const gitSkills = agent
    .getSkills()
    .filter(skill => skill.source === 'git')
    .map(skill => ({
      id: canonicalSkillId({ repoUrl: skill.url, path: skill.path ?? '' }),
      pin: skill.pin,
    }));
  const skillIds = gitSkills.map(skill => skill.id);
  const skillPins = Object.fromEntries(
    gitSkills.map(skill => [skill.id, skill.pin]),
  );

  return {
    id: `${installation}/${namespace}/${name}`,
    installation,
    namespace,
    name: agent.getDisplayName(),
    technicalName: name,
    description: agent.getDescription() ?? '',
    model: modelLabel(modelConfig) ?? agent.getModelConfigName(),
    modelName: modelConfig?.getModel(),
    harness: harnessName,
    ...(harness && { harnessTitle: harnessTitle(harnessChoiceOf(harness)) }),
    skillCount: agent.getSkillCount(),
    ...(skillIds.length > 0 ? { skillIds, skillPins } : {}),
    ...(modelConfigName
      ? { modelConfigId: `${installation}/${namespace}/${modelConfigName}` }
      : {}),
    readiness: agent.getReadiness(),
    readinessMessage: agent.getReadinessMessage(),
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(serving ? { modelServing: summarizeClientServing(serving) } : {}),
    ...(carriers
      ? { toolset: toolsetOfAgent(agent, MUSTER_MCP_SERVER_NAME, carriers) }
      : {}),
  };
}

/**
 * Stable ordering: the home installation's rows first, then by installation,
 * then display name. Without a `home` (a portal without one, or a caller that
 * does not care) it is installation-then-name alone.
 */
export function sortAgentRows(rows: AgentRow[], home?: string): AgentRow[] {
  const rank = (installation: string) =>
    home !== undefined && installation === home ? 0 : 1;
  return [...rows].sort(
    (a, b) =>
      rank(a.installation) - rank(b.installation) ||
      a.installation.localeCompare(b.installation) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * The environments in scope that answered without kagent, so no agent can be
 * listed or created there -- `installationsWithoutComponent`, the rule every
 * tab says "kagent is not installed on <environment>" by.
 */
export type KagentMissing = {
  /** The environments in scope, each answered without kagent. */
  installations: string[];
  /** Another environment runs kagent, so the Environment select is a way out. */
  canChooseAnother: boolean;
};

/**
 * {@link KagentMissing} for the scope, or `undefined` when kagent is not known
 * to be missing from it (see `installationsWithoutComponent`).
 * `installationsWithKagent` is the inventory's `installationsWith('kagent')`.
 */
export function selectKagentMissing(
  entries: InstallationInventoryEntry[],
  scope: InstallationScope,
  installationsWithKagent: string[],
): KagentMissing | undefined {
  const installations = installationsWithoutComponent(entries, scope, 'kagent');
  if (!installations) {
    return undefined;
  }
  return {
    installations,
    canChooseAnother: installationsWithKagent.some(
      installation => !installations.includes(installation),
    ),
  };
}

/**
 * Under "All environments", the environments switched off in the sidebar's
 * Cluster access that run kagent: switching one back on is the way to its
 * agents. Empty under a pinned scope.
 */
export function selectKagentSwitchedOff(
  entries: InstallationInventoryEntry[],
  scope: InstallationScope,
): string[] {
  if (scope !== ALL_INSTALLATIONS) {
    return [];
  }
  return entries
    .filter(
      entry =>
        entry.muted && entry.probe === 'answered' && entry.components.kagent,
    )
    .map(entry => entry.installation);
}

/**
 * What every page says when no agent is read because the environments that
 * run kagent are switched off in Cluster access ({@link selectKagentSwitchedOff}).
 */
export function describeKagentSwitchedOff(installations: string[]): string {
  return installations.length === 1
    ? `${installations[0]} runs kagent but is switched off in Cluster access, so its agents are not read.`
    : `${joinNames(
        installations,
      )} run kagent but are switched off in Cluster access, so their agents are not read.`;
}
