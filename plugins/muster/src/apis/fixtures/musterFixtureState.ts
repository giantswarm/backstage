import { TAGS_ANNOTATION } from '@giantswarm/backstage-plugin-gs-common';
import {
  fixtureDataSet,
  inInstallation,
  onFixtureScenarioReset,
  type ConnectorState,
  type FixtureConnector,
  type FixtureDataSet,
  type FixtureExecution,
  type FixtureToolsetPreset,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import type { KubeObjectInterface } from '@giantswarm/backstage-plugin-kubernetes-react';

import { DISPLAY_NAME_ANNOTATION } from '../../lib/k8s/MCPServer';
import type { ApprovalPreset } from '../../lib/toolApproval';
import type { MCPServerApproval, ToolSummary } from '../types';
import {
  connectorToolsOf,
  connectorKeyOf,
  mcpServerObjectOf,
  musterWorkflowObjectOf,
  FIXTURE_APPROVAL_UNAVAILABLE,
  presetApprovalOf,
  reviewedApprovalOf,
  CONNECT_ARGUMENTS,
  UPDATE_ARGUMENTS,
  musterWorkflowOf,
  servedToolsOf,
  type MusterFixtureConnector,
  type MusterFixtureWorkflow,
  type ServedTools,
} from './musterFixtureData';

/**
 * How long a connector connects after a write starts it (create, an edit,
 * activate, reconnect, a sign-in) before it settles in the state its
 * definition leads to. Shorter than the pages' follow-up read after a write
 * (`STATUS_FOLLOW_UP_MS`), so that read shows where it settled.
 */
export const CONNECT_MS = 2000;

/** The tools a connector registered in fixture mode offers once it serves. */
export const NEW_CONNECTOR_TOOLS = 6;

/** Hosts no muster reaches: RFC 2606's `.invalid`. */
const UNREACHABLE_HOST = /\.invalid$/i;

/** Whether muster cannot reach a URL: it is no URL, or its host is `.invalid`. */
export function isUnreachableUrl(url: string): boolean {
  try {
    return UNREACHABLE_HOST.test(new URL(url).hostname);
  } catch {
    return true;
  }
}

/** The seeded states a connector keeps when it connects again. */
const KEPT_STATES: ReadonlySet<ConnectorState> = new Set([
  'Running',
  'Failed',
  'Disconnected',
]);

/** The states a start brings up again (muster's `IsDownState`). */
const DOWN_STATES: ReadonlySet<ConnectorState> = new Set([
  'Stopped',
  'Failed',
  'Disconnected',
]);

const ACTIVE_STATES: ReadonlySet<ConnectorState> = new Set([
  'Connected',
  'Running',
]);

/** The arguments of a definition write that are not `spec` fields. */
const NOT_SPEC = new Set([
  'name',
  'displayName',
  'tags',
  'clientCredentials',
  'suspended',
  'preset',
]);

const APPROVAL_PRESETS = new Set(['recommended', 'allow-all', 'ask-all']);

/**
 * muster's refusal of arguments a split connector write does not take
 * (`refuseOtherFields` in `internal/mcpserver/connector_writes.go`): before
 * anything is written, naming the tool that takes them.
 */
function refuseOtherArguments(
  tool: string,
  args: Record<string, unknown>,
  allowed: readonly string[],
  elsewhere: string,
): void {
  const other = Object.keys(args)
    .filter(key => key !== 'name' && !allowed.includes(key))
    .sort();
  if (other.length > 0) {
    throw connectorToolError(
      `${tool} does not take ${other.join(', ')}: use ${elsewhere}`,
      422,
    );
  }
}

/**
 * The `approval` or `preset` of a connector write, checked as muster's CRD
 * checks it: a rule of `Allow` or `Ask`, each tool `Allow`, `Ask` or `Block`.
 */
function approvalArgOf(
  args: Record<string, unknown>,
  connector: MusterFixtureConnector,
): MCPServerApproval | undefined {
  const preset = args.preset;
  if (preset !== undefined) {
    if (typeof preset !== 'string' || !APPROVAL_PRESETS.has(preset)) {
      throw connectorToolError(
        `Invalid preset ${JSON.stringify(preset)}: use recommended, allow-all or ask-all`,
        422,
      );
    }
    return presetApprovalOf(preset as ApprovalPreset, connector);
  }
  const approval = args.approval as MCPServerApproval | undefined;
  if (approval === undefined) {
    return undefined;
  }
  if (
    approval.rule !== undefined &&
    !['Allow', 'Ask'].includes(approval.rule)
  ) {
    throw connectorToolError(
      `Invalid approval: rule must be Allow or Ask, not ${approval.rule}`,
      422,
    );
  }
  for (const [tool, value] of Object.entries(approval.tools ?? {})) {
    if (!['Allow', 'Ask', 'Block'].includes(value)) {
      throw connectorToolError(
        `Invalid approval: ${tool} must be Allow, Ask or Block, not ${value}`,
        422,
      );
    }
  }
  return { ...approval };
}

type StoredConnector = {
  /** The record the reads map; `state` is the settled or seeded one. */
  connector: FixtureConnector;
  /** The `MCPServer` spec, as created and changed by writes. */
  spec: Record<string, unknown>;
  tags: string[];
  suspended: boolean;
  /** The person signed in to it in this session (an OAuth connector). */
  signedIn: boolean;
  /** The seeded state it keeps when it connects again ({@link KEPT_STATES}). */
  kept?: ConnectorState;
  /** `metadata.generation`: bumped by every write to the spec. */
  generation: number;
  /**
   * The generation muster's status describes: it trails a write that
   * started the connector until the connector settled.
   */
  observedGeneration: number;
  /** Until when it connects, after a write started it. */
  connectingUntil?: number;
};

/** What muster serves in one installation now, worked out once per change. */
export type MusterFixtureSnapshot = {
  /** The connectors in their states now. */
  connectors: MusterFixtureConnector[];
  /** The tools the serving connectors offer. */
  served: ServedTools;
  /** Every tool the connectors offer, serving or not: what usage counts. */
  connectorTools: ToolSummary[];
  workflows: MusterFixtureWorkflow[];
  executions: FixtureExecution[];
  /**
   * The tools served when the executions ran: the data set's. A past run is
   * a record, so it reads the same whatever the connectors do since.
   */
  recorded: ServedTools;
  presets: FixtureToolsetPreset[];
  /** muster's objects as the Kubernetes API lists them. */
  objects: KubeObjectInterface[];
};

type InstallationStore = {
  connectors: Map<string, StoredConnector>;
  workflows: MusterFixtureWorkflow[];
  executions: FixtureExecution[];
  recorded: ServedTools;
  presets: FixtureToolsetPreset[];
  revision: number;
  snapshot?: {
    revision: number;
    validUntil: number;
    value: MusterFixtureSnapshot;
  };
};

/**
 * A tool error as the portal's client throws it: muster-backend's status, and
 * the kind gs-node names a connector write's refusal with.
 */
export function connectorToolError(
  message: string,
  status: number = 500,
): Error {
  return Object.assign(
    new Error(message),
    { status },
    status === 422 ? { kind: 'connector_refused' } : {},
  );
}

/** muster's answer to a start or restart of a server waiting on OAuth. */
export function oauthLoginGuidance(name: string): string {
  return (
    `Service '${name}' requires OAuth authentication.\n\n` +
    'To connect to this server, use the core_auth_login tool:\n' +
    `  core_auth_login(server="${name}")\n\n` +
    'The service start/restart command cannot be used for OAuth-protected servers ' +
    'because authentication is session-scoped.'
  );
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function tagsOf(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === 'string')
    : undefined;
}

function authOf(spec: Record<string, unknown>) {
  const auth = spec.auth as
    { type?: string; forwardToken?: boolean } | undefined;
  return auth?.type && auth.type !== 'none' ? auth : undefined;
}

/**
 * Each installation's muster in the page's data set, as the writes of the
 * muster pages leave it (docs/fixtures.md, "muster"): its connectors,
 * created, edited, deleted, turned off and on and reconnected, kept in memory
 * until the page reloads, and its workflows and toolset presets, read
 * against those connectors, and the executions, kept as they ran.
 *
 * A connector a write starts connects for {@link CONNECT_MS}, then settles
 * where its definition leads: failed at a host no muster reaches, waiting for
 * the person's sign-in when it uses OAuth (until they sign in), waiting for a
 * session when it forwards the person's token, connected otherwise. A seeded
 * connector that is failed, disconnected or running keeps that state when it
 * connects again, until an edit changes its URL or its sign-in. A workflow
 * whose steps call a tool no serving connector offers is unavailable.
 */
export class MusterFixtureState {
  private readonly installations = new Map<string, InstallationStore>();

  constructor(
    private readonly data: FixtureDataSet = fixtureDataSet(),
    private readonly now: () => number = Date.now,
  ) {}

  private storeOf(installation: string): InstallationStore {
    let store = this.installations.get(installation);
    if (!store) {
      const connectors = inInstallation(this.data.connectors, installation);
      // muster serves the organizations' namespaces too, keyed
      // `<namespace>/<name>`; workflows and the record use its own.
      const served = [
        ...connectors,
        ...inInstallation(this.data.organizationConnectors ?? [], installation),
      ];
      // One connector starts reviewed, so the Tools tab and the edit's Test &
      // Tools step show settings, a blocked tool and a New one.
      const reviewed = connectors.find(
        connector => !connector.namespace && connector.state === 'Connected',
      );
      store = {
        connectors: new Map(
          served.map(connector => [
            connectorKeyOf(connector),
            {
              connector,
              spec: {
                ...mcpServerObjectOf(connector).spec,
                ...(connector === reviewed && {
                  approval: reviewedApprovalOf(connector),
                }),
              },
              tags: [],
              suspended: connector.state === 'Stopped',
              signedIn: false,
              kept: KEPT_STATES.has(connector.state)
                ? connector.state
                : undefined,
              generation: 1,
              observedGeneration: 1,
            },
          ]),
        ),
        workflows: inInstallation(this.data.workflows, installation).map(
          workflow => musterWorkflowOf(workflow, connectors),
        ),
        executions: inInstallation(this.data.executions, installation),
        recorded: servedToolsOf(connectors),
        presets: inInstallation(this.data.toolsetPresets, installation),
        revision: 0,
      };
      this.installations.set(installation, store);
    }
    return store;
  }

  /** Where a connector settles once it has connected. */
  private settledStateOf(stored: StoredConnector): ConnectorState {
    if (isUnreachableUrl(stringOf(stored.spec.url) ?? '')) {
      return 'Failed';
    }
    if (stored.kept) {
      return stored.kept;
    }
    const auth = authOf(stored.spec);
    if (auth?.type === 'oauth') {
      if (auth.forwardToken) {
        return 'Awaiting Session';
      }
      return stored.signedIn ? 'Connected' : 'Auth Required';
    }
    return 'Connected';
  }

  /** The connector's state now, settling it once it has connected. */
  private stateOf(stored: StoredConnector, now: number): ConnectorState {
    if (stored.suspended) {
      return 'Stopped';
    }
    if (stored.connectingUntil !== undefined) {
      if (now < stored.connectingUntil) {
        return 'Connecting';
      }
      stored.connectingUntil = undefined;
      stored.observedGeneration = stored.generation;
      stored.connector = {
        ...stored.connector,
        state: this.settledStateOf(stored),
      };
    }
    return stored.connector.state;
  }

  /** The connector connects; its status catches up once it has settled. */
  private connect(stored: StoredConnector) {
    stored.connectingUntil = this.now() + CONNECT_MS;
  }

  /** A write to the connector's spec, as the API server counts it. */
  private written(stored: StoredConnector) {
    stored.generation++;
  }

  /** A write is done: the installation's reads are worked out again. */
  private changed(installation: string) {
    this.storeOf(installation).revision++;
  }

  private viewOf(
    stored: StoredConnector,
    state: ConnectorState,
  ): MusterFixtureConnector {
    const toolPrefix = stringOf(stored.spec.toolPrefix);
    const approval = stored.spec.approval as MCPServerApproval | undefined;
    return {
      ...stored.connector,
      state,
      ...(toolPrefix && toolPrefix !== stored.connector.name && { toolPrefix }),
      ...(approval && { approval }),
      // The second installation's muster has no shared store: what asks is
      // refused there, which the pages show as a warning.
      ...(stored.connector.installation ===
        this.data.installations[1]?.name && {
        approvalUnavailable: FIXTURE_APPROVAL_UNAVAILABLE,
      }),
    };
  }

  private objectOf(
    stored: StoredConnector,
    state: ConnectorState,
  ): KubeObjectInterface {
    const base = mcpServerObjectOf({ ...stored.connector, state });
    const annotations: Record<string, string> = {};
    if (stored.connector.displayName !== stored.connector.name) {
      annotations[DISPLAY_NAME_ANNOTATION] = stored.connector.displayName;
    }
    if (stored.tags.length > 0) {
      annotations[TAGS_ANNOTATION] = stored.tags.join(',');
    }
    return {
      ...base,
      metadata: {
        ...base.metadata,
        annotations,
        generation: stored.generation,
      },
      spec: {
        ...stored.spec,
        ...(stored.suspended && { suspended: true }),
      },
      status: {
        ...base.status,
        conditions: base.status?.conditions?.map(condition => ({
          ...condition,
          observedGeneration: stored.observedGeneration,
        })),
      },
    } as KubeObjectInterface;
  }

  /**
   * What the installation's muster serves now. The same object while nothing
   * changed there, so a reader can tell by identity.
   */
  snapshotOf(installation: string): MusterFixtureSnapshot {
    const store = this.storeOf(installation);
    const now = this.now();
    const cached = store.snapshot;
    if (
      cached &&
      cached.revision === store.revision &&
      now < cached.validUntil
    ) {
      return cached.value;
    }
    const stored = [...store.connectors.values()];
    const states = stored.map(entry => this.stateOf(entry, now));
    const connectors = stored.map((entry, index) =>
      this.viewOf(entry, states[index]),
    );
    const served = servedToolsOf(connectors);
    const value: MusterFixtureSnapshot = {
      connectors,
      served,
      connectorTools: connectors.flatMap(connectorToolsOf),
      workflows: store.workflows,
      executions: store.executions,
      recorded: store.recorded,
      presets: store.presets,
      objects: [
        ...stored.map((entry, index) => this.objectOf(entry, states[index])),
        ...store.workflows.map(workflow =>
          musterWorkflowObjectOf(workflow, served),
        ),
      ] as KubeObjectInterface[],
    };
    const upcoming = stored
      .map(entry => entry.connectingUntil ?? 0)
      .filter(time => time > now);
    store.snapshot = {
      revision: store.revision,
      validUntil: upcoming.length > 0 ? Math.min(...upcoming) : Infinity,
      value,
    };
    return value;
  }

  /**
   * muster's objects in the installation, as its Kubernetes API lists them:
   * an `MCPServer` per connector and a `Workflow` per workflow. The same
   * array while nothing changed there.
   */
  kubernetesObjectsOf(installation: string): KubeObjectInterface[] {
    return this.snapshotOf(installation).objects;
  }

  private find(
    installation: string,
    name: unknown,
    prefix: string,
  ): StoredConnector {
    if (typeof name !== 'string' || !name) {
      throw connectorToolError('name argument is required');
    }
    const stored = this.storeOf(installation).connectors.get(name);
    if (!stored) {
      throw connectorToolError(`${prefix}: MCP server '${name}' not found`);
    }
    return stored;
  }

  /** `core_mcpserver_create`. */
  create(installation: string, args: Record<string, unknown>): string {
    const name = stringOf(args.name)?.trim();
    if (!name) {
      throw connectorToolError(
        'Invalid MCP server definition: name is required',
        422,
      );
    }
    if (!stringOf(args.type)) {
      throw connectorToolError(
        'Invalid MCP server definition: type is required',
        422,
      );
    }
    const store = this.storeOf(installation);
    if (store.connectors.has(name)) {
      throw connectorToolError(`MCP server '${name}' already exists`, 422);
    }
    const spec = Object.fromEntries(
      Object.entries(args).filter(([key]) => !NOT_SPEC.has(key)),
    );
    const displayName = stringOf(args.displayName)?.trim();
    const stored: StoredConnector = {
      connector: {
        installation,
        name,
        displayName: displayName || name,
        description: stringOf(args.description) ?? '',
        url: stringOf(args.url) ?? '',
        state: 'Stopped',
        toolsCount: NEW_CONNECTOR_TOOLS,
      },
      spec,
      tags: tagsOf(args.tags) ?? [],
      suspended: false,
      signedIn: false,
      generation: 1,
      observedGeneration: 1,
    };
    const approval = approvalArgOf(
      args,
      this.viewOf(stored, stored.connector.state),
    );
    if (approval) {
      stored.spec.approval = approval;
    }
    // muster starts a server with `autoStart` as it registers it; one
    // without waits for a start.
    if (args.autoStart === true) {
      this.connect(stored);
    }
    store.connectors.set(name, stored);
    this.changed(installation);
    return `MCP server '${name}' created successfully`;
  }

  /**
   * `core_mcpserver_update`: what changes no target (description, display
   * name, tags, autoStart, timeout, suspended, restart). Refuses every other
   * argument before it writes, naming the tool that takes it, as muster does.
   */
  update(installation: string, args: Record<string, unknown>): string {
    refuseOtherArguments(
      'core_mcpserver_update',
      args,
      UPDATE_ARGUMENTS,
      'core_mcpserver_connect or core_mcpserver_set_approval',
    );
    return this.write(installation, args, { autoStart: true });
  }

  /**
   * `core_mcpserver_connect`: where the server is and how muster reaches it
   * (type, URL, sign-in, client, headers, ...). Refuses every other argument
   * before it writes, as muster does.
   */
  connectWrite(installation: string, args: Record<string, unknown>): string {
    refuseOtherArguments(
      'core_mcpserver_connect',
      args,
      CONNECT_ARGUMENTS,
      'core_mcpserver_update or core_mcpserver_set_approval',
    );
    return this.write(installation, args);
  }

  /**
   * The write of `update` and `connect`: a merge onto the stored definition,
   * by muster's rules (`mergeOntoExisting` in `lib/mcpServerDefinition.ts`):
   * an omitted field keeps its value, `autoStart` is overwritten, an empty
   * description keeps the stored one, an empty display name removes it, and
   * `suspended` changes only when given. A connector that was started
   * connects again; one never started stays stopped.
   */
  private write(
    installation: string,
    args: Record<string, unknown>,
    { autoStart = false }: { autoStart?: boolean } = {},
  ): string {
    const stored = this.find(
      installation,
      args.name,
      'Failed to update MCP server',
    );
    const wasStarted = this.stateOf(stored, this.now()) !== 'Stopped';
    const previous = JSON.stringify([stored.spec.url, authOf(stored.spec)]);
    const spec = { ...stored.spec };
    for (const [key, value] of Object.entries(args)) {
      if (NOT_SPEC.has(key) || value === undefined) {
        continue;
      }
      if (key === 'description' && !value) {
        continue;
      }
      spec[key] = value;
    }
    // The update's: there an omitted `autoStart` reads false; a connect
    // does not take it and keeps it.
    if (autoStart && args.autoStart === undefined) {
      delete spec.autoStart;
    }
    if (authOf(spec) === undefined) {
      delete spec.auth;
    }
    stored.spec = spec;
    const displayName = stringOf(args.displayName);
    stored.connector = {
      ...stored.connector,
      description: stringOf(spec.description) ?? '',
      url: stringOf(spec.url) ?? '',
      ...(displayName !== undefined && {
        displayName: displayName.trim() || stored.connector.name,
      }),
    };
    const tags = tagsOf(args.tags);
    if (tags) {
      stored.tags = tags;
    }
    if (typeof args.suspended === 'boolean') {
      stored.suspended = args.suspended;
    }
    // A new address or sign-in is a new attempt: a seeded failure or
    // connection no longer holds.
    if (JSON.stringify([spec.url, authOf(spec)]) !== previous) {
      stored.kept = undefined;
    }
    this.written(stored);
    if (!stored.suspended && wasStarted) {
      this.connect(stored);
    } else {
      stored.connectingUntil = undefined;
      stored.observedGeneration = stored.generation;
    }
    this.changed(installation);
    return `MCP server '${stored.connector.name}' updated successfully`;
  }

  /**
   * `core_mcpserver_set_approval`: the connector's tool approval, explicit
   * (`approval`) or a preset written out for its tools. Applies at once, as
   * muster reads the settings on every listing and call.
   */
  setApproval(installation: string, args: Record<string, unknown>): string {
    const stored = this.find(
      installation,
      args.name,
      'Failed to set the approval of MCP server',
    );
    const approval = approvalArgOf(
      args,
      this.viewOf(stored, this.stateOf(stored, this.now())),
    );
    if (!approval) {
      throw connectorToolError(
        'approval or preset is required (presets: recommended, allow-all, ask-all)',
        422,
      );
    }
    stored.spec = { ...stored.spec, approval };
    this.written(stored);
    stored.observedGeneration = stored.generation;
    this.changed(installation);
    return `Approval of MCP server '${stored.connector.name}' updated successfully`;
  }

  /** `core_mcpserver_delete`. */
  delete(installation: string, args: Record<string, unknown>): string {
    const stored = this.find(
      installation,
      args.name,
      'Failed to delete MCP server',
    );
    this.storeOf(installation).connectors.delete(
      connectorKeyOf(stored.connector),
    );
    this.changed(installation);
    return `MCP server '${stored.connector.name}' deleted successfully`;
  }

  /**
   * `core_service_start`: turns on a connector turned off and starts one
   * that is down (`spec.restartRequestedAt`); one up or on its way up is left
   * as it is, as muster does.
   */
  start(installation: string, args: Record<string, unknown>): string {
    const stored = this.find(
      installation,
      args.name,
      'Failed to look up MCP server',
    );
    const name = stored.connector.name;
    const state = this.stateOf(stored, this.now());
    const down = DOWN_STATES.has(state);
    if (!stored.suspended && !down) {
      if (state === 'Auth Required') {
        throw connectorToolError(oauthLoginGuidance(name));
      }
      if (state === 'Awaiting Session') {
        return `Service '${name}' is reachable and connected per session with the caller's own identity; there is nothing to start`;
      }
      if (ACTIVE_STATES.has(state)) {
        return `Service '${name}' is already running`;
      }
      return `Service '${name}' is in state "${state}"; no start request was written — check core_service_status and retry if it does not come up`;
    }
    stored.suspended = false;
    if (down) {
      stored.spec = {
        ...stored.spec,
        restartRequestedAt: new Date(this.now()).toISOString(),
      };
    }
    this.written(stored);
    this.connect(stored);
    this.changed(installation);
    return this.requested(stored, 'start');
  }

  /** `core_service_stop`: turns the connector off (`spec.suspended`). */
  stop(installation: string, args: Record<string, unknown>): string {
    const stored = this.find(
      installation,
      args.name,
      'Failed to look up MCP server',
    );
    const name = stored.connector.name;
    if (stored.suspended) {
      return `Service '${name}' is already suspended`;
    }
    stored.suspended = true;
    this.written(stored);
    // Stopping ends a pending connect: the status describes the stop.
    stored.connectingUntil = undefined;
    stored.observedGeneration = stored.generation;
    stored.connector = { ...stored.connector, state: 'Stopped' };
    this.changed(installation);
    return `Stop of service '${name}' requested (spec.suspended=true); the reconciler will stop it and keep it stopped`;
  }

  /**
   * `core_service_restart`: connects the connector again
   * (`spec.restartRequestedAt`). Refused for one turned off and for one
   * waiting on the person's OAuth sign-in.
   */
  restart(installation: string, args: Record<string, unknown>): string {
    const stored = this.find(
      installation,
      args.name,
      'Failed to look up MCP server',
    );
    const name = stored.connector.name;
    if (stored.suspended) {
      throw connectorToolError(
        `Service '${name}' is suspended; use core_service_start to resume it`,
      );
    }
    if (this.stateOf(stored, this.now()) === 'Auth Required') {
      throw connectorToolError(oauthLoginGuidance(name));
    }
    stored.spec = {
      ...stored.spec,
      restartRequestedAt: new Date(this.now()).toISOString(),
    };
    this.written(stored);
    this.connect(stored);
    this.changed(installation);
    return this.requested(stored, 'restart');
  }

  /** muster's answer to an accepted start or restart request. */
  private requested(stored: StoredConnector, verb: 'start' | 'restart') {
    const action = verb === 'start' ? 'Start' : 'Restart';
    const message = `${action} of service '${stored.connector.name}' requested; the reconciler will ${verb} it`;
    return authOf(stored.spec)?.type === 'oauth'
      ? `${message}. This server uses OAuth: if it comes up auth-required, authenticate with core_auth_login`
      : message;
  }

  /**
   * The person signed in to a connector (`core_auth_login`): one waiting on
   * their sign-in connects. False for a name that is no connector.
   */
  signIn(installation: string, name: string): boolean {
    const stored = this.storeOf(installation).connectors.get(name);
    if (!stored) {
      return false;
    }
    stored.signedIn = true;
    if (this.stateOf(stored, this.now()) === 'Auth Required') {
      this.connect(stored);
    }
    this.changed(installation);
    return true;
  }

  /**
   * The person signed out of a connector: one that serves them through their
   * OAuth sign-in asks for it again. False for a name that is no connector.
   */
  signOut(installation: string, name: string): boolean {
    const stored = this.storeOf(installation).connectors.get(name);
    if (!stored) {
      return false;
    }
    stored.signedIn = false;
    const state = this.stateOf(stored, this.now());
    if (authOf(stored.spec)?.type === 'oauth' && ACTIVE_STATES.has(state)) {
      stored.connector = {
        ...stored.connector,
        state: this.settledStateOf(stored),
      };
    }
    this.changed(installation);
    return true;
  }
}

let state: MusterFixtureState | undefined;
onFixtureScenarioReset(() => {
  state = undefined;
});

/**
 * The state every muster fixture reads, built on first use from the page's
 * data set, and again after the scenario changed.
 */
export function musterFixtureState(): MusterFixtureState {
  state ??= new MusterFixtureState();
  return state;
}
