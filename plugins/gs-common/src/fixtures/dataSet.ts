import {
  buildAgents,
  buildConnectors,
  buildExecutions,
  buildInstallations,
  buildOrganizations,
  buildSessions,
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
  type FixtureWorkflow,
  type InstallationState,
  type OrganizationState,
  type SessionState,
  type WorkflowState,
} from './builders';
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
};

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
};

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
  return {
    installations,
    organizations,
    agents,
    connectors: buildConnectors(context, installations, settings.connectors),
    sessions: buildSessions(context, agents, organizations, settings.sessions),
    workflows,
    executions: buildExecutions(context, workflows, settings.executions),
  };
}

let base: FixtureDataSet | undefined;

/**
 * The base data set every fixture handler reads: the served installations,
 * each with organizations, agents, connectors, sessions, workflows and
 * executions in every state. Built once, on first read, counting back from
 * that moment.
 */
export function baseDataSet(): FixtureDataSet {
  base ??= createFixtureDataSet();
  return base;
}

/** The items of a data set's list in one installation. */
export function inInstallation<T extends { installation: string }>(
  items: readonly T[],
  installation: string,
): T[] {
  return items.filter(item => item.installation === installation);
}
