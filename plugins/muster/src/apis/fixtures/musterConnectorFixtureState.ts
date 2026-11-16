import { TAGS_ANNOTATION } from '@giantswarm/backstage-plugin-gs-common';
import {
  fixtureDataSet,
  inInstallation,
  onFixtureScenarioReset,
  type ConnectorState,
  type FixtureConnector,
  type FixtureDataSet,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import type { KubeObjectInterface } from '@giantswarm/backstage-plugin-kubernetes-react';

import { DISPLAY_NAME_ANNOTATION } from '../../lib/k8s/MCPServer';
import { mcpServerObjectOf, musterWorkflowObjectOf } from './musterFixtureData';

/**
 * How long a connector connects after a write starts it (create, an edit,
 * activate, reconnect, a sign-in) before it settles in the state its
 * definition leads to. Shorter than the pages' follow-up read after a write
 * (`STATUS_FOLLOW_UP_MS`), so that read shows where it settled.
 */
export const CONNECT_MS = 2000;

/** The tools a connector registered in fixture mode offers once it serves. */
export const NEW_CONNECTOR_TOOLS = 6;

/**
 * Hosts no muster reaches (RFC 2606's `.invalid`): a connector at one fails
 * once it has tried to connect.
 */
const UNREACHABLE_HOST = /\.invalid$/i;

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
]);

type StoredConnector = {
  /** The record the reads map; `state` is the settled or seeded one. */
  connector: FixtureConnector;
  /** The `MCPServer` spec, as created and changed by updates. */
  spec: Record<string, unknown>;
  tags: string[];
  suspended: boolean;
  /** The person signed in to it in this session (an OAuth connector). */
  signedIn: boolean;
  /** The seeded state it keeps when it connects again ({@link KEPT_STATES}). */
  kept?: ConnectorState;
  generation: number;
  /**
   * The generation muster's status describes: an edit's trails until the
   * connector settled with it.
   */
  observedGeneration: number;
  /** Until when it connects, after a write started it. */
  connectingUntil?: number;
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
 * The connectors of each installation's muster, as the writes of the muster
 * pages leave them (docs/fixtures.md, "muster"): created, edited, deleted,
 * deactivated, activated and reconnected, kept in memory until the page
 * reloads. A connector a write starts connects for {@link CONNECT_MS}, then
 * settles where its definition leads: failed at a host no muster reaches,
 * waiting for the person's sign-in when it uses OAuth (until they sign in),
 * waiting for a session when it forwards the person's token, connected
 * otherwise. A seeded connector that is failed, disconnected or running keeps
 * that state when it connects again, until an edit changes its URL.
 */
export class MusterConnectorFixtureState {
  private readonly installations = new Map<
    string,
    Map<string, StoredConnector>
  >();
  private revision = 0;
  private readonly cache = new Map<
    string,
    {
      revision: number;
      validUntil: number;
      connectors: FixtureConnector[];
      objects: KubeObjectInterface[];
    }
  >();

  constructor(
    private readonly data: FixtureDataSet = fixtureDataSet(),
    private readonly now: () => number = Date.now,
  ) {}

  private storeOf(installation: string): Map<string, StoredConnector> {
    let store = this.installations.get(installation);
    if (!store) {
      store = new Map(
        inInstallation(this.data.connectors, installation).map(connector => {
          const object = mcpServerObjectOf(connector);
          return [
            connector.name,
            {
              connector,
              spec: { ...object.spec },
              tags: [],
              suspended: connector.state === 'Stopped',
              signedIn: false,
              kept: KEPT_STATES.has(connector.state)
                ? connector.state
                : undefined,
              generation: 1,
              observedGeneration: 1,
            },
          ];
        }),
      );
      this.installations.set(installation, store);
    }
    return store;
  }

  private changed() {
    this.revision++;
  }

  /** Where a connector settles once it has connected. */
  private settledStateOf(stored: StoredConnector): ConnectorState {
    const url = stringOf(stored.spec.url) ?? '';
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      host = '';
    }
    if (UNREACHABLE_HOST.test(host)) {
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

  private connect(stored: StoredConnector) {
    stored.connectingUntil = this.now() + CONNECT_MS;
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

  private snapshot(installation: string) {
    const now = this.now();
    const cached = this.cache.get(installation);
    if (
      cached &&
      cached.revision === this.revision &&
      now < cached.validUntil
    ) {
      return cached;
    }
    const stored = [...this.storeOf(installation).values()];
    const states = stored.map(entry => this.stateOf(entry, now));
    const connectors = stored.map((entry, index) => ({
      ...entry.connector,
      state: states[index],
    }));
    const objects = [
      ...stored.map((entry, index) => this.objectOf(entry, states[index])),
      ...inInstallation(this.data.workflows, installation).map(workflow =>
        musterWorkflowObjectOf(workflow, this.data.connectors),
      ),
    ] as KubeObjectInterface[];
    const upcoming = stored
      .map(entry => entry.connectingUntil ?? 0)
      .filter(time => time > now);
    const snapshot = {
      revision: this.revision,
      validUntil: upcoming.length > 0 ? Math.min(...upcoming) : Infinity,
      connectors,
      objects,
    };
    this.cache.set(installation, snapshot);
    return snapshot;
  }

  /**
   * The installation's connectors in their states now. The same array while
   * nothing changed, so a reader can tell by identity.
   */
  connectorsOf(installation: string): FixtureConnector[] {
    return this.snapshot(installation).connectors;
  }

  /**
   * muster's objects in the installation, as its Kubernetes API lists them:
   * an `MCPServer` per connector and a `Workflow` per workflow. The same
   * array while nothing changed.
   */
  kubernetesObjectsOf(installation: string): KubeObjectInterface[] {
    return this.snapshot(installation).objects;
  }

  private find(
    installation: string,
    name: unknown,
    prefix: string,
  ): StoredConnector {
    if (typeof name !== 'string' || !name) {
      throw connectorToolError('name argument is required');
    }
    const stored = this.storeOf(installation).get(name);
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
    if (store.has(name)) {
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
    // muster starts a server with `autoStart` as it registers it; one
    // without waits for a start.
    if (args.autoStart === true) {
      this.connect(stored);
    }
    store.set(name, stored);
    this.changed();
    return `MCP server '${name}' created successfully`;
  }

  /**
   * `core_mcpserver_update`: a merge onto the stored definition, by muster's
   * rules (`mergeOntoExisting` in `lib/mcpServerDefinition.ts`): an omitted
   * field keeps its value, `autoStart` is overwritten, an empty description
   * keeps the stored one, an empty display name removes it, and `suspended`
   * changes only when given. A running connector connects again.
   */
  update(installation: string, args: Record<string, unknown>): string {
    const stored = this.find(
      installation,
      args.name,
      'Failed to update MCP server',
    );
    if (!stringOf(args.type)) {
      throw connectorToolError(
        'Invalid MCP server definition: type is required',
        422,
      );
    }
    const previousUrl = stringOf(stored.spec.url);
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
    if (args.autoStart === undefined) {
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
    if (stringOf(spec.url) !== previousUrl) {
      stored.kept = undefined;
    }
    stored.generation++;
    if (stored.suspended) {
      stored.observedGeneration = stored.generation;
    } else {
      this.connect(stored);
    }
    this.changed();
    return `MCP server '${stored.connector.name}' updated successfully`;
  }

  /** `core_mcpserver_delete`. */
  delete(installation: string, args: Record<string, unknown>): string {
    const stored = this.find(
      installation,
      args.name,
      'Failed to delete MCP server',
    );
    this.storeOf(installation).delete(stored.connector.name);
    this.changed();
    return `MCP server '${stored.connector.name}' deleted successfully`;
  }

  /**
   * `core_service_start`: activates a deactivated connector and starts one
   * that is down; one up or on its way up is left as it is, as muster does.
   */
  start(installation: string, args: Record<string, unknown>): string {
    const stored = this.find(
      installation,
      args.name,
      'Failed to look up MCP server',
    );
    const name = stored.connector.name;
    const state = this.stateOf(stored, this.now());
    if (!stored.suspended && !DOWN_STATES.has(state)) {
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
    this.connect(stored);
    this.changed();
    return this.requested(stored, `Start of service '${name}' requested`);
  }

  /** `core_service_stop`: deactivates the connector. */
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
    stored.connectingUntil = undefined;
    stored.connector = { ...stored.connector, state: 'Stopped' };
    this.changed();
    return `Stop of service '${name}' requested (spec.suspended=true); the reconciler will stop it and keep it stopped`;
  }

  /**
   * `core_service_restart`: connects the connector again. Refused for a
   * deactivated one and for one waiting on the person's OAuth sign-in.
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
    this.connect(stored);
    this.changed();
    return this.requested(stored, `Restart of service '${name}' requested`);
  }

  private requested(stored: StoredConnector, base: string): string {
    const verb = base.startsWith('Start') ? 'start' : 'restart';
    const message = `${base}; the reconciler will ${verb} it`;
    return authOf(stored.spec)?.type === 'oauth'
      ? `${message}. This server uses OAuth: if it comes up auth-required, authenticate with core_auth_login`
      : message;
  }

  /**
   * The person signed in to a connector (`core_auth_login`): one waiting on
   * their sign-in connects. Undefined for a name that is no connector.
   */
  signIn(installation: string, name: string): boolean | undefined {
    const stored = this.storeOf(installation).get(name);
    if (!stored) {
      return undefined;
    }
    stored.signedIn = true;
    if (this.stateOf(stored, this.now()) === 'Auth Required') {
      this.connect(stored);
    }
    this.changed();
    return true;
  }

  /**
   * The person signed out of a connector: one that serves them through their
   * OAuth sign-in asks for it again.
   */
  signOut(installation: string, name: string): boolean | undefined {
    const stored = this.storeOf(installation).get(name);
    if (!stored) {
      return undefined;
    }
    stored.signedIn = false;
    const state = this.stateOf(stored, this.now());
    if (authOf(stored.spec)?.type === 'oauth' && ACTIVE_STATES.has(state)) {
      stored.connector = {
        ...stored.connector,
        state: this.settledStateOf(stored),
      };
    }
    this.changed();
    return true;
  }
}

let state: MusterConnectorFixtureState | undefined;
onFixtureScenarioReset(() => {
  state = undefined;
});

/** The state every muster fixture reads: built on first use. */
export function musterConnectorFixtureState(): MusterConnectorFixtureState {
  state ??= new MusterConnectorFixtureState();
  return state;
}
