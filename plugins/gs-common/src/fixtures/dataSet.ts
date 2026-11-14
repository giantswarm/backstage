import {
  buildAgents,
  buildConnectors,
  buildExecutions,
  buildInstallations,
  buildOrganizations,
  buildSessions,
  buildToolsetPresets,
  buildWorkflows,
  type AgentBuilderSettings,
  type BuilderSettings,
  type ConnectorState,
  type ExecutionState,
  type FixtureAgent,
  type FixtureConnector,
  type FixtureExecution,
  type FixtureInstallation,
  type FixtureOrganization,
  type FixtureSession,
  type FixtureToolsetPreset,
  type FixtureWorkflow,
  type InstallationState,
  type OrganizationState,
  type SessionState,
  type WorkflowState,
} from './builders';
import {
  buildRepositories,
  buildRepositoryOwners,
  buildSkillRepositories,
  buildToolchainSources,
  buildToolchains,
  buildWorkspaces,
  type FixtureRepository,
  type FixtureRepositoryOwner,
  type FixtureSkillRepository,
  type FixtureToolchain,
  type FixtureToolchainSource,
  type FixtureWorkspace,
  type SkillRepositoryState,
  type ToolchainSourceState,
  type WorkspaceState,
} from './managerBuilders';
import {
  buildHosting,
  type FixtureHostingData,
  type FixtureHostingSettings,
} from './hostingBuilders';
import { createRandom } from './random';

/**
 * Everything fixture mode serves, in one place, so every fixture API and tool
 * handler tells the same story: the agents an organization lists are the
 * agents whose sessions kagent lists, and so on. Plain records, not any
 * client's answer: each fixture maps them onto the type its client reads.
 */
export type FixtureDataSet = {
  installations: FixtureInstallation[];
  organizations: FixtureOrganization[];
  agents: FixtureAgent[];
  connectors: FixtureConnector[];
  sessions: FixtureSession[];
  workflows: FixtureWorkflow[];
  executions: FixtureExecution[];
  /** muster's toolset presets, made from the connectors and workflows. */
  toolsetPresets: FixtureToolsetPreset[];
  /** The owners on the provider instances, the same in every installation. */
  repositoryOwners: FixtureRepositoryOwner[];
  repositories: FixtureRepository[];
  workspaces: FixtureWorkspace[];
  toolchainSources: FixtureToolchainSource[];
  toolchains: FixtureToolchain[];
  skillRepositories: FixtureSkillRepository[];
} & FixtureHostingData;

/** The settings of a data set: the seed, "now", and each builder's. */
export type FixtureDataSetSettings = {
  /** The same seed and `now` give the same data set. */
  seed?: number;
  /** What the timestamps count back from, in ms; the current time if left out. */
  now?: number;
  installations?: BuilderSettings<InstallationState>;
  /** Per installation. */
  organizations?: BuilderSettings<OrganizationState>;
  /** Per organization with a namespace. */
  agents?: AgentBuilderSettings;
  /** Per installation. */
  connectors?: BuilderSettings<ConnectorState>;
  /** Per ready agent of a ready organization. */
  sessions?: BuilderSettings<SessionState>;
  /** Per installation. */
  workflows?: BuilderSettings<WorkflowState>;
  /** Per workflow. */
  executions?: BuilderSettings<ExecutionState>;
  /** Per provider instance. */
  repositoryOwners?: BuilderSettings<FixtureRepositoryOwner['kind']>;
  /** Per owner. */
  repositories?: BuilderSettings<'repository'>;
  /** Per ready organization the person is a member of. */
  workspaces?: BuilderSettings<WorkspaceState>;
  /** Per installation. */
  toolchainSources?: BuilderSettings<ToolchainSourceState>;
  /** Per offered source whose toolchains can be read. */
  toolchains?: BuilderSettings<'written' | 'handWritten'>;
  /** Per installation. */
  skillRepositories?: BuilderSettings<SkillRepositoryState>;
  /** Per skill repository that lists its skills. */
  skills?: { count?: number; nameLength?: number };
} & FixtureHostingSettings;

/** The seed of the base data set. */
export const BASE_SEED = 20261114;

/** Builds a data set; every setting left out takes the base data set's. */
export function createFixtureDataSet(
  settings: FixtureDataSetSettings = {},
): FixtureDataSet {
  const context = {
    random: createRandom(settings.seed ?? BASE_SEED),
    now: settings.now ?? Date.now(),
  };
  const installations = buildInstallations(context, settings.installations);
  const organizations = buildOrganizations(
    context,
    installations,
    settings.organizations,
  );
  const agents = buildAgents(context, organizations, settings.agents);
  const workflows = buildWorkflows(context, installations, settings.workflows);
  const connectors = buildConnectors(
    context,
    installations,
    settings.connectors,
  );
  const sessions = buildSessions(
    context,
    agents,
    organizations,
    settings.sessions,
  );
  const executions = buildExecutions(context, workflows, settings.executions);
  // The managers' lists draw after the rest, so adding them left the
  // earlier lists as they were.
  const repositoryOwners = buildRepositoryOwners(
    context,
    settings.repositoryOwners,
  );
  const repositories = buildRepositories(
    context,
    repositoryOwners,
    settings.repositories,
  );
  const toolchainSources = buildToolchainSources(
    context,
    installations,
    settings.toolchainSources,
  );
  const managers = {
    workspaces: buildWorkspaces(
      context,
      organizations,
      repositoryOwners,
      repositories,
      settings.workspaces,
    ),
    toolchainSources,
    toolchains: buildToolchains(context, toolchainSources, settings.toolchains),
    skillRepositories: buildSkillRepositories(
      context,
      installations,
      settings.skillRepositories,
      settings.skills,
    ),
  };
  return {
    installations,
    organizations,
    agents,
    connectors,
    sessions,
    workflows,
    executions,
    toolsetPresets: buildToolsetPresets(installations, connectors, workflows),
    repositoryOwners,
    repositories,
    ...managers,
    // Model hosting draws last, so adding it left the lists above as they
    // were.
    ...buildHosting(context, installations, organizations, settings),
  };
}

let base: FixtureDataSet | undefined;

/**
 * The base data set every fixture handler reads: the served installations,
 * each with organizations, agents, connectors, sessions, workflows,
 * executions, workspaces, toolchains and skill repositories in every state.
 * Built once, on first read, counting back from that moment.
 */
export function baseDataSet(): FixtureDataSet {
  base ??= createFixtureDataSet();
  return base;
}

/** Whether a data set says an installation's muster is not reachable from the portal. */
export function isUnreachableInstallation(
  data: FixtureDataSet,
  installation: string,
): boolean {
  return data.installations.some(
    i => i.name === installation && i.state === 'unreachable',
  );
}

/**
 * The 503 muster-backend answers for an installation its probe reports
 * unreachable from the portal, as the real client throws it.
 */
export function unreachableInstallationError(installation: string): Error {
  return Object.assign(
    new Error(
      `${installation} did not answer: not reachable from this portal (timeout)`,
    ),
    { name: 'ServiceUnavailableError', status: 503 },
  );
}

/** The items of a data set's list in one installation. */
export function inInstallation<T extends { installation: string }>(
  items: readonly T[],
  installation: string,
): T[] {
  return items.filter(item => item.installation === installation);
}
