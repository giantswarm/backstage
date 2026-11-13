import { FIXTURE_INSTALLATION } from '../fixtureMode';
import {
  createNamer,
  fitName,
  fixtureSentence,
  MAX_NAME_LENGTH,
} from './names';
import type { FixtureRandom } from './random';

/**
 * What a builder makes: how many items (per parent, for a list under another
 * one), how long their names are at least, and the states they take. Items
 * take the states in turn, counted over the whole list, so every state shows
 * once there are as many items as states.
 */
export type BuilderSettings<State extends string> = {
  count?: number;
  /** The least length of each name, in characters; at most 63. */
  nameLength?: number;
  states?: readonly State[];
};

/**
 * Whether muster answers from an installation, as the portal probes it
 * (`MusterInstallationInfo.reachable`: true, false, not settled yet).
 */
export const INSTALLATION_STATES = [
  'reachable',
  'unreachable',
  'unknown',
] as const;
export type InstallationState = (typeof INSTALLATION_STATES)[number];

/**
 * An organization's state, as agent-manager lists it: `pending` before the
 * operator created its namespace, `orphaned` once it is missing from git,
 * `deleting` while it is erased.
 */
export const ORGANIZATION_STATES = [
  'ready',
  'pending',
  'orphaned',
  'deleting',
] as const;
export type OrganizationState = (typeof ORGANIZATION_STATES)[number];

/** An Agent's readiness, as the portal derives it from its conditions. */
export const AGENT_STATES = ['ready', 'notReady', 'failed', 'pending'] as const;
export type AgentState = (typeof AGENT_STATES)[number];

/** An MCP server's `.status.state`, muster's CRD enum. */
export const CONNECTOR_STATES = [
  'Connected',
  'Running',
  'Auth Required',
  'Awaiting Session',
  'Starting',
  'Connecting',
  'Stopped',
  'Disconnected',
  'Failed',
] as const;
export type ConnectorState = (typeof CONNECTOR_STATES)[number];

/** A kagent Session record's runtime state, as one lower-case word. */
export const SESSION_STATES = [
  'ready',
  'suspended',
  'creating',
  'failed',
  'deleting',
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

/** Whether muster offers a workflow (`WorkflowListItem.available`). */
export const WORKFLOW_STATES = ['available', 'unavailable'] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

/** A workflow execution's status. */
export const EXECUTION_STATES = ['completed', 'failed', 'inprogress'] as const;
export type ExecutionState = (typeof EXECUTION_STATES)[number];

export type FixtureInstallation = {
  name: string;
  state: InstallationState;
};

export type FixtureOrganization = {
  installation: string;
  name: string;
  displayName: string;
  /** The parent namespace the organization lives in. */
  parent: string;
  /** The organization namespace; absent while `pending`. */
  namespace?: string;
  state: OrganizationState;
};

export type FixtureAgent = {
  installation: string;
  /** The organization the agent belongs to, by name. */
  organization: string;
  namespace: string;
  name: string;
  displayName: string;
  description: string;
  state: AgentState;
};

export type FixtureConnector = {
  installation: string;
  name: string;
  displayName: string;
  description: string;
  url: string;
  state: ConnectorState;
  toolsCount: number;
};

export type FixtureSession = {
  installation: string;
  /** kagent's session id: opaque, here a UUID. */
  id: string;
  title: string;
  agent: { namespace: string; name: string };
  state: SessionState;
  /** RFC 3339. */
  createdAt: string;
  updatedAt: string;
};

export type FixtureWorkflow = {
  installation: string;
  name: string;
  description: string;
  state: WorkflowState;
};

export type FixtureExecution = {
  installation: string;
  id: string;
  workflow: string;
  state: ExecutionState;
  /** RFC 3339. */
  startedAt: string;
  /** RFC 3339; absent while in progress. */
  completedAt?: string;
  durationMs: number;
  stepCount: number;
  /** Why it failed; set for a failed execution only. */
  error?: string;
};

/** What every builder draws from: the seeded numbers and the time "now". */
export type BuilderContext = { random: FixtureRandom; now: number };

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** The parent namespace organizations live in. */
export const ORGANIZATION_PARENT = 'agents';

function each<State extends string, Parent, Item>(
  parents: readonly Parent[],
  settings: BuilderSettings<State>,
  defaults: { count: number; states: readonly State[] },
  make: (
    parent: Parent,
    state: State,
    nameLength: number,
    index: number,
  ) => Item,
): Item[] {
  const count = settings.count ?? defaults.count;
  const states = settings.states ?? defaults.states;
  if (states.length === 0) {
    throw new Error('A builder needs at least one state.');
  }
  const nameLength = Math.min(settings.nameLength ?? 0, MAX_NAME_LENGTH);
  const items: Item[] = [];
  for (const parent of parents) {
    for (let i = 0; i < count; i++) {
      const index = items.length;
      items.push(
        make(parent, states[index % states.length], nameLength, index),
      );
    }
  }
  return items;
}

function hex(context: BuilderContext, length: number): string {
  let value = '';
  for (let i = 0; i < length; i++) {
    value += context.random.int(0, 15).toString(16);
  }
  return value;
}

function uuid(context: BuilderContext): string {
  return [8, 4, 4, 4, 12].map(length => hex(context, length)).join('-');
}

function isoAgo(context: BuilderContext, ms: number): string {
  return new Date(context.now - ms).toISOString();
}

/**
 * Installations: the first is the one fixture mode serves,
 * {@link FIXTURE_INSTALLATION}, whatever the name length; the others have
 * made-up names.
 */
export function buildInstallations(
  context: BuilderContext,
  settings: BuilderSettings<InstallationState> = {},
): FixtureInstallation[] {
  const name = createNamer(context.random);
  return each(
    [undefined],
    settings,
    { count: 3, states: INSTALLATION_STATES },
    (_, state, nameLength, index) => ({
      name: index === 0 ? FIXTURE_INSTALLATION : name(nameLength).name,
      state,
    }),
  );
}

/** Organizations, `count` in each installation. */
export function buildOrganizations(
  context: BuilderContext,
  installations: readonly FixtureInstallation[],
  settings: BuilderSettings<OrganizationState> = {},
): FixtureOrganization[] {
  const name = createNamer(context.random);
  return each(
    installations,
    settings,
    { count: 4, states: ORGANIZATION_STATES },
    (installation, state, nameLength) => {
      const organization = name(nameLength);
      const suffix = hex(context, 5);
      return {
        installation: installation.name,
        name: organization.name,
        displayName: organization.displayName,
        parent: ORGANIZATION_PARENT,
        ...(state !== 'pending' && {
          namespace: `${ORGANIZATION_PARENT}-${fitName(
            organization.name,
            MAX_NAME_LENGTH - ORGANIZATION_PARENT.length - suffix.length - 2,
          )}-${suffix}`,
        }),
        state,
      };
    },
  );
}

/**
 * Agents, `count` in each organization that has a namespace: a pending
 * organization has none to run them in.
 */
export function buildAgents(
  context: BuilderContext,
  organizations: readonly FixtureOrganization[],
  settings: BuilderSettings<AgentState> = {},
): FixtureAgent[] {
  const name = createNamer(context.random);
  return each(
    organizations.filter(organization => organization.namespace),
    settings,
    { count: 2, states: AGENT_STATES },
    (organization, state, nameLength) => {
      const agent = name(nameLength);
      return {
        installation: organization.installation,
        organization: organization.name,
        namespace: organization.namespace!,
        name: agent.name,
        displayName: agent.displayName,
        description: fixtureSentence(context.random),
        state,
      };
    },
  );
}

/** Connectors (MCP servers behind muster), `count` in each installation. */
export function buildConnectors(
  context: BuilderContext,
  installations: readonly FixtureInstallation[],
  settings: BuilderSettings<ConnectorState> = {},
): FixtureConnector[] {
  const name = createNamer(context.random);
  return each(
    installations,
    settings,
    { count: CONNECTOR_STATES.length, states: CONNECTOR_STATES },
    (installation, state, nameLength) => {
      const connector = name(nameLength);
      return {
        installation: installation.name,
        name: connector.name,
        displayName: connector.displayName,
        description: fixtureSentence(context.random),
        url: `https://${connector.name}.example.com/mcp`,
        state,
        toolsCount: context.random.int(1, 24),
      };
    },
  );
}

/** kagent sessions, `count` with each agent. */
export function buildSessions(
  context: BuilderContext,
  agents: readonly FixtureAgent[],
  settings: BuilderSettings<SessionState> = {},
): FixtureSession[] {
  const title = createNamer(context.random);
  return each(
    agents,
    settings,
    { count: 2, states: SESSION_STATES },
    (agent, state, nameLength) => {
      const created = context.random.int(1, 30 * DAY);
      return {
        installation: agent.installation,
        id: uuid(context),
        title: title(nameLength).displayName,
        agent: { namespace: agent.namespace, name: agent.name },
        state,
        createdAt: isoAgo(context, created),
        updatedAt: isoAgo(context, context.random.int(0, created)),
      };
    },
  );
}

/** muster workflows, `count` in each installation. */
export function buildWorkflows(
  context: BuilderContext,
  installations: readonly FixtureInstallation[],
  settings: BuilderSettings<WorkflowState> = {},
): FixtureWorkflow[] {
  const name = createNamer(context.random);
  return each(
    installations,
    settings,
    { count: 3, states: WORKFLOW_STATES },
    (installation, state, nameLength) => ({
      installation: installation.name,
      name: name(nameLength).name,
      description: fixtureSentence(context.random),
      state,
    }),
  );
}

/**
 * Executions, `count` of each workflow. The name length setting does not
 * apply: an execution is named by its id.
 */
export function buildExecutions(
  context: BuilderContext,
  workflows: readonly FixtureWorkflow[],
  settings: BuilderSettings<ExecutionState> = {},
): FixtureExecution[] {
  return each(
    workflows,
    settings,
    { count: 3, states: EXECUTION_STATES },
    (workflow, state) => {
      const started = context.random.int(10 * MINUTE, 14 * DAY);
      const durationMs =
        state === 'inprogress'
          ? Math.min(started, context.random.int(1000, 5 * MINUTE))
          : context.random.int(200, 2 * MINUTE);
      return {
        installation: workflow.installation,
        id: uuid(context),
        workflow: workflow.name,
        state,
        startedAt: isoAgo(context, started),
        ...(state !== 'inprogress' && {
          completedAt: isoAgo(context, started - durationMs),
        }),
        durationMs,
        stepCount: context.random.int(1, 6),
        ...(state === 'failed' && {
          error: `Step ${context.random.int(1, 3)} failed: the connector did not answer.`,
        }),
      };
    },
  );
}
