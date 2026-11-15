import type { Query } from '@tanstack/react-query';
import {
  Agent,
  AgentReadiness,
  AgentInterface,
  deriveAgentReadiness,
  getAgentStatusChangedAt,
  Harness,
  type HarnessRuntime,
  isAgentTransitional,
  KubeObjectInterface,
  ModelConfig,
  RemoteMCPServer,
} from '@giantswarm/backstage-plugin-kubernetes-react';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- GS owns the shared installation inventory.
import {
  ALL_INSTALLATIONS,
  classifyInventoryFailure,
  installationsWithComponent,
  installationsWithoutComponent,
  selectInventoryFailure,
  type InstallationInventory,
  type InstallationInventoryEntry,
  type InstallationScope,
  type InventoryFailure,
} from '@giantswarm/backstage-plugin-gs';
import { joinNames } from '@giantswarm/backstage-plugin-ui-react';
import { modelLabel } from '../../lib/modelLabel';
import {
  summarizeClientServing,
  type ClientServingState,
  type ClientServingSummary,
} from '../../lib/serving';
import { canonicalSkillId } from '../../lib/skills';
import { agentManagerBlocker } from '../../lib/agentManager';
import type { AgentManagerAvailability } from '../../hooks/useAgentManager';
import type { DirectServer } from '../../lib/connectorMarks';
import { directServerName, mcpBindingId } from '../AgentDetailPage/helpers';
import {
  isGatewayBinding,
  MUSTER_MCP_SERVER_NAME,
  toolsetOfAgent,
  type DeclaredToolset,
  type ToolsetCarrier,
} from '../../lib/toolset';
import { harnessChoiceOf, harnessTitle } from '../../lib/harnesses';
import {
  CREATED_BY_ANNOTATION,
  CREATED_BY_NAME_ANNOTATION,
  ownerOf,
} from '../../lib/tenants';
import {
  DEFAULT_WORKSPACE_ANNOTATION,
  defaultWorkspaceName,
} from '../../lib/defaultWorkspace';
import {
  DEFAULT_TOOLCHAINS_ANNOTATION,
  defaultToolchainsOf,
  type ToolchainPick,
} from '../../lib/toolchainManager';
import {
  EMPTY_ORGANIZATION_DIRECTORY,
  type OrganizationDirectory,
} from '../../lib/organizations';

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
 * Per-installation refetch interval for the agent list, re-evaluated by
 * react-query after every fetch of that installation's list:
 *
 * - no list yet, or an empty one: the baseline;
 * - an agent still converging (see {@link isAgentConverging}): the
 *   transitional tier;
 * - every agent settled, or broken past the convergence window: the baseline.
 *
 * An agent deployed from this tab but not listed yet is not seen here;
 * `AgentsDataProvider` tightens the interval for it. Interval refetches fire
 * only while the tab is focused.
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
  /** Keywords to find the agent by (`Agent.getTags()`); empty when none. */
  tags: string[];
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
  /**
   * That Harness's runtime family, once it has been read: what decides
   * whether a message may carry images (`imagesUnsupportedReason`).
   */
  harnessRuntime?: HarnessRuntime;
  /** The ModelConfig's `spec.provider` (`Anthropic`, `OpenAI`, `Ollama`, …). */
  modelProvider?: string;
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
  /**
   * The same-namespace `AgentTemplate` the agent runs (`spec.templateRef`),
   * when its template is not inline: its model is named there, so a missing
   * {@link modelConfigId} does not mean the agent has none.
   */
  templateRef?: string;
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
   * The servers the agent binds directly rather than through the gateway,
   * named as the agent page names them. Absent for none.
   */
  directServers?: DirectServer[];
  /**
   * What the serving layer says about the model behind the agent's
   * ModelConfig — the served model's readiness, or that nothing answers for
   * it any more (`notServing`: the agent's turns fail). Independent of the
   * agent's own readiness: kagent deploys an agent happily whose model is
   * gone. `undefined` when the ModelConfig is unknown, points at an external
   * provider, or no serving layer is in view.
   */
  modelServing?: ClientServingSummary;
  /**
   * Why no session can start with the agent from this portal, whatever its
   * readiness: sessions start through agent-manager as the person, and the
   * installation's muster lists none or runs calls under its shared identity
   * ({@link agentManagerSessionGate}). `undefined` when nothing stands in the
   * way, or while that is still being read.
   */
  sessionBlocker?: string;
  /**
   * Whether that is still being read: the agent is not offered yet, so
   * nothing is preselected or started that the answer then withdraws.
   */
  isSessionPending?: boolean;
  /**
   * The tenant the agent belongs to, as its owner ({@link ownerOf} its
   * namespace): `Platform`, the organization's name, or `namespace <name>`.
   */
  tenant?: string;
  /**
   * Who created the agent ({@link CREATED_BY_ANNOTATION}, the caller's email
   * agent-manager recorded): for display and the "created by me" filter only.
   * `undefined` for an agent created before agent-manager recorded it, or
   * not through agent-manager.
   */
  createdBy?: string;
  /**
   * The creator's display name ({@link CREATED_BY_NAME_ANNOTATION}), shown in
   * place of `createdBy`; display only. `undefined` where none was recorded.
   */
  createdByName?: string;
  /** When the `Agent` was created (`metadata.creationTimestamp`). */
  createdAt?: string;
  /**
   * The name of the agent's default workspace
   * ({@link DEFAULT_WORKSPACE_ANNOTATION}): what a new session's workspace
   * picker presets to when the person has not chosen one with the agent
   * before. `undefined` for none.
   */
  defaultWorkspace?: string;
  /**
   * The agent's default toolchains ({@link DEFAULT_TOOLCHAINS_ANNOTATION}):
   * what a new session mounts unless the person starting it changes them.
   * `undefined` for none.
   */
  defaultToolchains?: ToolchainPick[];
};

/**
 * Whether sessions can start on an installation through agent-manager, from
 * its availability: a blocker with its reason, or pending while the reads are
 * in flight. A settled `unknown` (the person's muster session there is not
 * connected yet, or the read failed) blocks nothing: starting then offers
 * the sign-in, as it always has. Nothing either on a portal without the
 * muster plugin, where starting reports that itself.
 */
export function agentManagerSessionGate(
  availability: Pick<
    AgentManagerAvailability,
    'presenceOf' | 'isLoading' | 'isUnavailable'
  >,
  installation: string,
): Pick<AgentRow, 'sessionBlocker' | 'isSessionPending'> {
  if (availability.isUnavailable) {
    return {};
  }
  const presence = availability.presenceOf(installation);
  if (presence === 'unknown') {
    return availability.isLoading ? { isSessionPending: true } : {};
  }
  const sessionBlocker = agentManagerBlocker(presence, installation);
  return sessionBlocker ? { sessionBlocker } : {};
}

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
 * How a ModelConfig resolves to the serving layer —
 * `useServing().servingStateFor`, partially applied to the installation.
 */
export type ResolveModelServing = (
  modelConfig: ModelConfig,
) => ClientServingState | undefined;

/**
 * Flatten an `Agent` into a plain {@link AgentRow}. With a
 * `resolveServing`, the row also carries the serving state of the model behind
 * the agent's ModelConfig; without one (no serving layer in view) it does not.
 * With `carriers` — the installation's `RemoteMCPServer`s — it carries the
 * toolset read off the agent's own carrier; without them it does not. With
 * `harnesses`, the installation's Harnesses, it carries its Harness's title.
 * Its owner is named by `organizations`, which namespace is which
 * organization as agent-manager answered it.
 */
export function toAgentRow(
  agent: Agent,
  modelConfigs: ModelConfig[],
  resolveServing?: ResolveModelServing,
  carriers?: readonly (ToolsetCarrier &
    Pick<RemoteMCPServer, 'getAnnotations'>)[],
  harnesses?: readonly Harness[],
  organizations: OrganizationDirectory = EMPTY_ORGANIZATION_DIRECTORY,
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
  // The named Harness's once read, or the inline one's.
  const harnessRuntime = harnessName
    ? harness?.getRuntime()
    : agent.getInlineHarnessRuntime();
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
  const createdBy = agent.getAnnotations()?.[CREATED_BY_ANNOTATION]?.trim();
  const createdByName = agent
    .getAnnotations()
    ?.[CREATED_BY_NAME_ANNOTATION]?.trim();
  const createdAt = agent.getCreatedTimestamp();
  const defaultWorkspace = defaultWorkspaceName(
    agent.getAnnotations()?.[DEFAULT_WORKSPACE_ANNOTATION],
  );
  const defaultToolchains = defaultToolchainsOf(
    agent.getAnnotations()?.[DEFAULT_TOOLCHAINS_ANNOTATION],
  );
  const directServers = agent
    .getMcpBindings()
    .filter(
      binding => !isGatewayBinding(agent, binding, MUSTER_MCP_SERVER_NAME),
    )
    .map((binding, index) => ({
      // The server name is not unique: two bindings may scope one server
      // differently.
      key: `${mcpBindingId(binding)}#${index}`,
      name: directServerName(
        binding,
        carriers?.filter(carrier => carrier.getNamespace() === namespace),
      ),
      ...(binding.requireApproval ? { approval: true } : {}),
    }));
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
    tags: agent.getTags(),
    model: modelLabel(modelConfig) ?? agent.getModelConfigName(),
    modelName: modelConfig?.getModel(),
    harness: harnessName,
    ...(harness && { harnessTitle: harnessTitle(harnessChoiceOf(harness)) }),
    ...(harnessRuntime && { harnessRuntime }),
    ...(modelConfig?.getProvider() && {
      modelProvider: modelConfig.getProvider(),
    }),
    skillCount: agent.getSkillCount(),
    ...(skillIds.length > 0 ? { skillIds, skillPins } : {}),
    ...(modelConfigName
      ? { modelConfigId: `${installation}/${namespace}/${modelConfigName}` }
      : {}),
    ...(agent.getTemplateRef() ? { templateRef: agent.getTemplateRef() } : {}),
    readiness: agent.getReadiness(),
    readinessMessage: agent.getReadinessMessage(),
    tenant: ownerOf(namespace, organizations),
    ...(createdBy ? { createdBy } : {}),
    ...(createdByName ? { createdByName } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(defaultWorkspace ? { defaultWorkspace } : {}),
    ...(defaultToolchains.length > 0 ? { defaultToolchains } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(serving ? { modelServing: summarizeClientServing(serving) } : {}),
    ...(directServers.length > 0 ? { directServers } : {}),
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
 */
export function selectKagentMissing(
  entries: InstallationInventoryEntry[],
  scope: InstallationScope,
): KagentMissing | undefined {
  const installations = installationsWithoutComponent(entries, scope, 'kagent');
  if (!installations) {
    return undefined;
  }
  return {
    installations,
    canChooseAnother: installationsWithComponent(entries, 'kagent').some(
      installation => !installations.includes(installation),
    ),
  };
}

/**
 * What every page says when no agent is read because the environments that
 * run kagent are switched off in Cluster access
 * (`installationsSwitchedOffWithComponent`).
 */
export function describeKagentSwitchedOff(installations: string[]): string {
  return installations.length === 1
    ? `${installations[0]} runs kagent but is switched off in Cluster access, so its agents are not read.`
    : `${joinNames(
        installations,
      )} run kagent but are switched off in Cluster access, so their agents are not read.`;
}

/**
 * The pinned environment, when the inventory has answered and knows no
 * environment by that name (a stale `?installation=` deep link): nothing to
 * ask, and nothing else can say why nothing is listed.
 */
export function selectUnknownPin(
  inventory: Pick<InstallationInventory, 'entries' | 'isLoading'>,
  scope: InstallationScope,
): string | undefined {
  if (
    scope === ALL_INSTALLATIONS ||
    inventory.isLoading ||
    inventory.entries.length === 0 ||
    inventory.entries.some(entry => entry.installation === scope)
  ) {
    return undefined;
  }
  return scope;
}

/**
 * The environment that could not be asked whether it runs kagent, as the
 * agents lists explain it: the pinned one, or the home one under "All
 * environments" -- or, when nothing is listed and no environment in scope
 * runs kagent within reach (`listsNothing`), any environment in scope not
 * switched off, since that failure is then the only explanation there is.
 * `undefined` for an unknown pin, which is its own explanation.
 */
export function selectAgentsInventoryFailure(
  inventory: Pick<InstallationInventory, 'entries' | 'home'>,
  scope: InstallationScope,
  {
    unknownPin,
    listsNothing,
  }: { unknownPin: string | undefined; listsNothing: boolean },
): InventoryFailure | undefined {
  if (unknownPin) {
    return undefined;
  }
  const pinned = scope === ALL_INSTALLATIONS ? null : scope;
  return (
    selectInventoryFailure(inventory, pinned) ??
    (listsNothing && pinned === null
      ? inventory.entries
          .filter(entry => !entry.muted)
          .map(classifyInventoryFailure)
          .find(failure => failure !== undefined)
      : undefined)
  );
}
