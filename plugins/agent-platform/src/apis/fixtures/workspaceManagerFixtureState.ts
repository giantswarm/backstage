import {
  DAY,
  FIXTURE_PROVIDERS,
  MINUTE,
  baseDataSet,
  hashOf,
  inInstallation,
  isWorkspaceOrganization,
  type FixtureDataSet,
  type FixtureProvider,
  type FixtureRepository,
  type FixtureWorkspace,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import type {
  ActiveSync,
  CreateWorkspaceInput,
  DeleteWorkspaceResult,
  LastSync,
  ListRepositoriesInput,
  PreviewRepository,
  PreviewWorkspaceInput,
  ProviderOwner,
  RepositoriesPage,
  SessionDirectory,
  SyncRequest,
  SyncTrigger,
  SyncWorkspaceResult,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceAuthorization,
  WorkspaceDetail,
  WorkspaceList,
  WorkspacePreview,
  WorkspaceProvider,
  WorkspaceSizing,
  WorkspaceSource,
} from '../../lib/workspaceManager';
import { SETTLE_MS } from './agentManagerFixtureState';
import { FIXTURE_USER } from './fixtureIdentity';

/**
 * workspace-manager's state in fixture mode (docs/fixtures.md): the base
 * data set's workspaces of each installation, the repositories of the
 * provider instances' owners they select from, and the Session directories
 * of the organization's sessions. Writes change it in memory only, so they
 * last until the page reloads. A sync runs for {@link SETTLE_MS}, so the
 * pages show it running before its result.
 */

const GI = 1024 ** 3;

/** How long a grant of `authorize_workspace` lasts. */
const GRANT_TTL_MS = 10 * MINUTE;

/** How long a Session directory stays after the Session's last turn. */
const CLEANUP_AFTER_MS = 30 * DAY;

/** The default and largest page of a long answer. */
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/** A workspace's name: lower-case letters, digits and '-', a Kubernetes name. */
const WORKSPACE_NAME = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

/**
 * The error of a refusal, in workspace-manager's words (`toolError` in its
 * internal/api): the operation, then the class.
 */
function refused(operation: string, why: string): Error {
  return new Error(`${operation}: ${why}`);
}

function notFound(operation: string, workspace: string): Error {
  return refused(
    operation,
    `not found: workspaces.agent-platform.giantswarm.io "${workspace}" not found`,
  );
}

function invalid(operation: string, name: string, why: string): Error {
  return refused(
    operation,
    `invalid workspace: invalid workspace "${name}": ${why}`,
  );
}

type StoredSync = ActiveSync & {
  /** When the sync ends; never for one of the data set's that keeps running. */
  endsAt?: number;
};

/** A sync as workspace-manager reports it, without when it ends. */
function reported({ job, startedAt, trigger }: StoredSync): ActiveSync {
  return { job, startedAt, ...(trigger && { trigger }) };
}

type StoredWorkspace = {
  name: string;
  organization: string;
  sources: WorkspaceSource[];
  sizing?: WorkspaceSizing;
  resourceVersion: number;
  createdAt: string;
  lastSync?: LastSync;
  activeSync?: StoredSync;
  /** A sync requested while one runs, and what started it. */
  syncRequest?: SyncRequest & { trigger: SyncTrigger };
  /** The repositories the last successful sync mirrored. */
  mirrored: FixtureRepository[];
  /** When the workspace was deleted. */
  deletedAt?: number;
  sessionDirectories: SessionDirectory[];
};

type InstallationState = {
  workspaces: Map<string, StoredWorkspace>;
  /** The organizations the person is a member of. */
  organizations: string[];
};

/** A repository's `<owner>/<name>`. */
const fullName = (repository: FixtureRepository) =>
  `${repository.owner}/${repository.name}`;

/** A number below `modulo` from a string, the same every time. */
const stableNumber = (value: string, modulo: number) => hashOf(value) % modulo;

/** What a workspace's volume stores: its mirrors and its Session directories. */
function bytesOf(workspace: StoredWorkspace): {
  mirrorsBytes: number;
  sessionsBytes: number;
} {
  return {
    mirrorsBytes: workspace.mirrored.reduce(
      (sum, r) => sum + r.sizeKiB * 1024,
      0,
    ),
    sessionsBytes: workspace.sessionDirectories.reduce(
      (sum, d) => sum + d.sizeBytes,
      0,
    ),
  };
}

/** A tool argument as a string, `''` without one. */
const textOf = (value: unknown) => String(value ?? '');

/** How the person grants a provider instance's App in muster. */
function signInOf(provider: FixtureProvider): string {
  return `Grant the ${provider.name} App in muster first: core_auth_login app=${provider.name}`;
}

function providerOf(name: string): FixtureProvider | undefined {
  return FIXTURE_PROVIDERS.find(provider => provider.name === name);
}

/** Bytes as the Kubernetes quantity of whole Gi that holds them. */
function quantityOf(bytes: number, least = 1): string {
  return `${Math.max(least, Math.ceil(bytes / GI))}Gi`;
}

/** A page of `items`, from 1, as workspace-manager pages its answers. */
function pageOf<T>(
  items: T[],
  input: { page?: number; pageSize?: number },
): { page: number; pageSize: number; items: T[] } {
  const pageSize = Math.min(
    Math.max(input.pageSize ?? PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const page = Math.max(input.page ?? 1, 1);
  return {
    page,
    pageSize,
    items: items.slice((page - 1) * pageSize, page * pageSize),
  };
}

/** How many of `repositories` carry each name, most used first. */
function facetCounts(names: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** What a selection holds now. */
type Selection = {
  selected: { repository: FixtureRepository; why: string[] }[];
  excluded: number;
  skippedArchived: number;
  skippedForks: number;
};

export class WorkspaceManagerFixtureState {
  private readonly installations = new Map<string, InstallationState>();
  private jobs = 0;

  constructor(
    private readonly data: FixtureDataSet = baseDataSet(),
    private readonly now: () => number = Date.now,
  ) {}

  private stateOf(installation: string): InstallationState {
    let state = this.installations.get(installation);
    if (!state) {
      const organizations = inInstallation(
        this.data.organizations,
        installation,
      );
      state = {
        organizations: organizations
          .filter(isWorkspaceOrganization)
          .map(o => o.name)
          .sort((a, b) => a.localeCompare(b)),
        workspaces: new Map(
          this.storedOf(installation).map(w => [w.name, w] as const),
        ),
      };
      this.installations.set(installation, state);
    }
    for (const workspace of state.workspaces.values()) {
      this.settle(workspace);
      // A deleted workspace goes once no Session directory is left on it.
      if (
        workspace.deletedAt !== undefined &&
        workspace.sessionDirectories.length === 0 &&
        this.now() - workspace.deletedAt >= SETTLE_MS
      ) {
        state.workspaces.delete(workspace.name);
      }
    }
    return state;
  }

  /** The data set's workspaces of an installation, as workspace-manager holds them. */
  private storedOf(installation: string): StoredWorkspace[] {
    const workspaces = inInstallation(this.data.workspaces, installation);
    const directories = this.sessionDirectoriesOf(installation, workspaces);
    return workspaces.map(workspace => {
      const job = (time: string) =>
        `${workspace.name}-sync-${stableNumber(time, 100_000)}`;
      const lastSync: LastSync | undefined = workspace.lastSyncAt
        ? {
            time: workspace.lastSyncAt,
            job: job(workspace.lastSyncAt),
            ...(workspace.state === 'failed'
              ? {
                  result: 'Failed' as const,
                  trigger: 'retry' as const,
                  message: `fetching ${
                    this.selectionOf(workspace.sources).selected[0]?.repository
                      .name ??
                    workspace.sources[0]?.owner ??
                    'the sources'
                  }: the provider answered 502 Bad Gateway`,
                }
              : { result: 'Succeeded' as const, trigger: 'change' as const }),
          }
        : undefined;
      const startedAt = new Date(this.now() - 2 * MINUTE).toISOString();
      return {
        name: workspace.name,
        organization: workspace.organization,
        sources: workspace.sources,
        resourceVersion: 1,
        createdAt: workspace.createdAt,
        ...(lastSync && { lastSync }),
        ...(workspace.state === 'syncing' && {
          activeSync: {
            job: job(startedAt),
            startedAt,
            trigger: 'request' as const,
          },
        }),
        mirrored: lastSync ? this.mirrorable(workspace.sources) : [],
        ...(workspace.state === 'deleting' && {
          deletedAt: this.now() - MINUTE,
        }),
        sessionDirectories: directories.get(workspace.name) ?? [],
      };
    });
  }

  /**
   * The Session directories of each workspace: the sessions of the
   * organization's agents that ran, in turn over its synced workspaces, and
   * one whose Session kagent no longer lists on a workspace being deleted.
   */
  private sessionDirectoriesOf(
    installation: string,
    workspaces: FixtureWorkspace[],
  ): Map<string, SessionDirectory[]> {
    const byWorkspace = new Map<string, SessionDirectory[]>();
    const organizationOf = new Map(
      inInstallation(this.data.organizations, installation).flatMap(o =>
        o.namespace ? [[o.namespace, o.name] as const] : [],
      ),
    );
    const add = (workspace: string, directory: SessionDirectory) =>
      byWorkspace.set(workspace, [
        ...(byWorkspace.get(workspace) ?? []),
        directory,
      ]);
    const turn = new Map<string, number>();
    for (const session of inInstallation(this.data.sessions, installation)) {
      if (session.state !== 'ready' && session.state !== 'suspended') {
        continue;
      }
      const organization = organizationOf.get(session.agent.namespace);
      const candidates = workspaces.filter(
        w => w.organization === organization && w.lastSyncAt,
      );
      if (!organization || candidates.length === 0) {
        continue;
      }
      const index = turn.get(organization) ?? 0;
      turn.set(organization, index + 1);
      add(candidates[index % candidates.length].name, {
        session: session.id,
        name: session.title,
        creator: FIXTURE_USER.email,
        lastTurn: session.updatedAt,
        sizeBytes: stableNumber(session.id, 400 * 1024 ** 2),
        cleanupAfter: new Date(
          Date.parse(session.updatedAt) + CLEANUP_AFTER_MS,
        ).toISOString(),
      });
    }
    for (const workspace of workspaces) {
      if (workspace.state === 'deleting') {
        add(workspace.name, {
          session: `${workspace.name}-gone`,
          unknown: true,
          sizeBytes: stableNumber(workspace.name, 50 * 1024 ** 2),
          cleanupAfter: new Date(this.now() + 2 * DAY).toISOString(),
        });
      }
    }
    return byWorkspace;
  }

  /** Ends the syncs that ran their time, and starts a requested one after. */
  private settle(workspace: StoredWorkspace): void {
    const now = this.now();
    while (
      workspace.activeSync?.endsAt !== undefined &&
      workspace.activeSync.endsAt <= now
    ) {
      const { job, trigger, endsAt } = workspace.activeSync;
      workspace.lastSync = {
        time: new Date(endsAt).toISOString(),
        result: 'Succeeded',
        ...(trigger && { trigger }),
        job,
      };
      workspace.mirrored = this.mirrorable(workspace.sources);
      workspace.activeSync = undefined;
      if (workspace.syncRequest) {
        workspace.activeSync = this.syncFrom(
          endsAt,
          workspace.syncRequest.trigger,
        );
        workspace.syncRequest = undefined;
      }
    }
  }

  private syncFrom(start: number, trigger: SyncTrigger): StoredSync {
    this.jobs++;
    return {
      job: `sync-${start.toString(36)}-${this.jobs}`,
      startedAt: new Date(start).toISOString(),
      trigger,
      endsAt: start + SETTLE_MS,
    };
  }

  private mustBeMember(
    installation: string,
    operation: string,
    organization: string,
  ): void {
    if (!this.stateOf(installation).organizations.includes(organization)) {
      throw refused(
        operation,
        `permission denied: forbidden: ${FIXTURE_USER.email} is not a member of Organization "${organization}"`,
      );
    }
  }

  private stored(
    installation: string,
    operation: string,
    name: string,
  ): StoredWorkspace {
    const workspace = this.stateOf(installation).workspaces.get(name);
    if (!workspace) {
      throw notFound(operation, name);
    }
    return workspace;
  }

  // Selections

  private repositoriesOf(provider: string, owner: string): FixtureRepository[] {
    return this.data.repositories.filter(
      r => r.provider === provider && r.owner === owner,
    );
  }

  /** What the sources select now, and what they leave out. */
  private selectionOf(sources: readonly WorkspaceSource[]): Selection {
    const selection: Selection = {
      selected: [],
      excluded: 0,
      skippedArchived: 0,
      skippedForks: 0,
    };
    for (const source of sources) {
      const names = new Set(source.repositories ?? []);
      const languages = source.filters?.languages ?? [];
      const topics = source.filters?.topics;
      for (const repository of this.repositoriesOf(
        source.provider,
        source.owner,
      )) {
        const why: string[] = [];
        if (names.has(repository.name)) {
          why.push('name');
        }
        const byLanguage =
          repository.language && languages.includes(repository.language)
            ? [`language ${repository.language}`]
            : [];
        const topicsMatched = (topics?.names ?? []).filter(t =>
          repository.topics.includes(t),
        );
        const byTopics =
          topics?.match === 'all'
            ? topicsMatched.length === topics.names.length
            : topicsMatched.length > 0;
        const filtered =
          (languages.length > 0 || (topics?.names.length ?? 0) > 0) &&
          (languages.length === 0 || byLanguage.length > 0) &&
          (!topics?.names.length || byTopics);
        if (filtered) {
          why.push(...byLanguage, ...topicsMatched.map(t => `topic ${t}`));
        }
        if (why.length === 0) {
          continue;
        }
        if (source.exclude?.includes(repository.name)) {
          selection.excluded++;
          continue;
        }
        // A repository named counts even when archived or a fork.
        if (!names.has(repository.name)) {
          if (repository.archived && !source.includeArchived) {
            selection.skippedArchived++;
            continue;
          }
          if (repository.fork && !source.includeForks) {
            selection.skippedForks++;
            continue;
          }
        }
        selection.selected.push({ repository, why });
      }
    }
    return selection;
  }

  /**
   * What a sync mirrors: every selected repository. It fetches with the
   * workspace's own credentials, whatever the person viewing it may read;
   * their access counts when they start a Session (`authorize_workspace`).
   */
  private mirrorable(sources: readonly WorkspaceSource[]): FixtureRepository[] {
    return this.selectionOf(sources).selected.map(
      ({ repository }) => repository,
    );
  }

  private validate(
    operation: string,
    name: string,
    sources: WorkspaceSource[] | undefined,
  ): void {
    if (!Array.isArray(sources) || sources.length === 0) {
      throw invalid(operation, name, 'sources: at least one is required');
    }
    const errors = sources.flatMap((source, i) => {
      if (!providerOf(source.provider)) {
        return [
          `sources[${i}]: unknown provider instance "${source.provider}" (configured: ${FIXTURE_PROVIDERS.map(p => p.name).join(', ')})`,
        ];
      }
      if (!source.owner) {
        return [`sources[${i}]: owner is required`];
      }
      const selects =
        (source.repositories?.length ?? 0) > 0 ||
        (source.filters?.languages?.length ?? 0) > 0 ||
        (source.filters?.topics?.names.length ?? 0) > 0;
      return selects
        ? []
        : [`sources[${i}]: select repositories by name, language or topic`];
    });
    if (errors.length > 0) {
      throw invalid(operation, name, errors.join('; '));
    }
  }

  // Views

  private view(workspace: StoredWorkspace): Workspace {
    const { mirrorsBytes, sessionsBytes } = bytesOf(workspace);
    const stored = mirrorsBytes + sessionsBytes;
    const synced = Boolean(workspace.lastSync);
    const handle = `fs-${stableNumber(workspace.name, 0xffffff).toString(16)}`;
    return {
      name: workspace.name,
      organization: workspace.organization,
      sources: workspace.sources,
      ...(workspace.sizing && { sizing: workspace.sizing }),
      resourceVersion: String(workspace.resourceVersion),
      createdAt: workspace.createdAt,
      ...(workspace.deletedAt !== undefined && { deleting: true }),
      ...(workspace.lastSync && { lastSync: workspace.lastSync }),
      ...(workspace.activeSync && {
        activeSync: reported(workspace.activeSync),
      }),
      ...(workspace.syncRequest && {
        syncRequest: {
          requestedAt: workspace.syncRequest.requestedAt,
          requestedBy: workspace.syncRequest.requestedBy,
        },
      }),
      repositories: workspace.mirrored.length,
      volume: synced
        ? {
            claimName: `workspace-${workspace.name}`,
            driver: 'files.csi.example.com',
            handle,
          }
        : {
            claimName: `workspace-${workspace.name}`,
            pending: 'the volume is provisioned at the first sync',
          },
      ...(synced && {
        neededSize: quantityOf(stored * 1.2),
        volumeSize: quantityOf(stored * 1.5, 8),
        storedBytes: stored,
      }),
      sessions: workspace.sessionDirectories.length,
      conditions: [
        {
          type: 'Ready',
          status: workspace.lastSync?.result === 'Failed' ? 'False' : 'True',
          ...(workspace.lastSync?.result === 'Failed' && {
            reason: 'SyncFailed',
            message: workspace.lastSync.message,
          }),
        },
      ],
    };
  }

  // Tools

  listWorkspaces(installation: string, organization?: string): WorkspaceList {
    if (organization) {
      this.mustBeMember(installation, 'list workspaces', organization);
    }
    const state = this.stateOf(installation);
    return {
      workspaces: [...state.workspaces.values()]
        .filter(w => !organization || w.organization === organization)
        .map(w => this.view(w)),
      organizations: state.organizations,
    };
  }

  getWorkspace(installation: string, name: string): WorkspaceDetail {
    const workspace = this.stored(installation, 'get workspace', name);
    const view = this.view(workspace);
    return {
      workspace: view,
      mirrors: workspace.mirrored.map(repository => ({
        provider: repository.provider,
        repository: fullName(repository),
        defaultBranch: 'main',
        head: stableNumber(fullName(repository), 0xfffffff)
          .toString(16)
          .padStart(7, '0'),
        pushedAt: repository.pushedAt,
        sizeBytes: repository.sizeKiB * 1024,
      })),
      storage: {
        ...bytesOf(workspace),
        ...(view.neededSize && { neededSize: view.neededSize }),
        ...(view.volumeSize && { volumeSize: view.volumeSize }),
      },
      sessionDirectories: workspace.sessionDirectories,
    };
  }

  createWorkspace(
    installation: string,
    input: CreateWorkspaceInput,
  ): Workspace {
    const operation = 'create workspace';
    const name = String(input.name ?? '');
    if (!WORKSPACE_NAME.test(name)) {
      throw invalid(
        operation,
        name,
        'name: lower-case letters, digits and "-", at most 63, starting and ending with a letter or digit',
      );
    }
    this.mustBeMember(installation, operation, textOf(input.organization));
    this.validate(operation, name, input.sources);
    const state = this.stateOf(installation);
    if (state.workspaces.has(name)) {
      throw refused(
        operation,
        `already exists: workspaces.agent-platform.giantswarm.io "${name}" already exists`,
      );
    }
    const workspace: StoredWorkspace = {
      name,
      organization: input.organization,
      sources: input.sources,
      ...(input.sizing && { sizing: input.sizing }),
      resourceVersion: 1,
      createdAt: new Date(this.now()).toISOString(),
      activeSync: this.syncFrom(this.now(), 'change'),
      mirrored: [],
      sessionDirectories: [],
    };
    state.workspaces.set(name, workspace);
    return this.view(workspace);
  }

  updateWorkspace(
    installation: string,
    input: UpdateWorkspaceInput,
  ): Workspace {
    const operation = 'update workspace';
    const workspace = this.stored(installation, operation, input.name);
    if (
      input.resourceVersion &&
      input.resourceVersion !== String(workspace.resourceVersion)
    ) {
      throw refused(
        operation,
        `the workspace changed since it was read; read it again and retry: Operation cannot be fulfilled on workspaces.agent-platform.giantswarm.io "${input.name}": the object has been modified`,
      );
    }
    this.validate(operation, input.name, input.sources);
    workspace.sources = input.sources;
    if (input.sizing) {
      workspace.sizing =
        Object.keys(input.sizing).length > 0 ? input.sizing : undefined;
    }
    workspace.resourceVersion++;
    // A workspace being deleted syncs no more: the change is written only.
    if (workspace.deletedAt === undefined) {
      this.requestSync(workspace, 'change');
    }
    return this.view(workspace);
  }

  deleteWorkspace(installation: string, name: string): DeleteWorkspaceResult {
    const workspace = this.stored(installation, 'delete workspace', name);
    workspace.deletedAt ??= this.now();
    workspace.activeSync = undefined;
    workspace.syncRequest = undefined;
    return {
      workspace: name,
      sessions: workspace.sessionDirectories.map(d => d.session),
    };
  }

  /**
   * Starts a sync now, or after the one that runs: a request made while a
   * sync runs is served after it, and that sync ends then, the data set's
   * that would otherwise keep running among them.
   */
  private requestSync(workspace: StoredWorkspace, trigger: SyncTrigger): void {
    const now = this.now();
    if (!workspace.activeSync) {
      workspace.activeSync = this.syncFrom(now, trigger);
      return;
    }
    workspace.activeSync.endsAt ??= now + SETTLE_MS;
    workspace.syncRequest = {
      requestedAt: new Date(now).toISOString(),
      requestedBy: FIXTURE_USER.email,
      // A change outweighs a plain request: the cycle serves both.
      trigger: workspace.syncRequest?.trigger === 'change' ? 'change' : trigger,
    };
  }

  /**
   * Requests a sync. On a workspace being deleted, as workspace-manager
   * does, it runs the deletion cycle instead, which syncs nothing: the
   * answer says so and no sync starts.
   */
  syncWorkspace(
    installation: string,
    name: string,
  ): SyncWorkspaceResult & { deleting?: boolean } {
    const workspace = this.stored(installation, 'sync workspace', name);
    const request = {
      requestedAt: new Date(this.now()).toISOString(),
      requestedBy: FIXTURE_USER.email,
    };
    if (workspace.deletedAt !== undefined) {
      return { workspace: name, ...request, deleting: true };
    }
    const running = workspace.activeSync;
    this.requestSync(workspace, 'request');
    return {
      workspace: name,
      ...request,
      ...(running && { activeSync: reported(running) }),
    };
  }

  authorizeWorkspace(
    installation: string,
    name: string,
  ): WorkspaceAuthorization {
    const workspace = this.stored(installation, 'authorize workspace', name);
    if (workspace.deletedAt !== undefined) {
      return {
        workspace: name,
        outcome: 'refused',
        reason: `workspace ${name} is being deleted`,
      };
    }
    if (!workspace.lastSync) {
      return {
        workspace: name,
        outcome: 'refused',
        reason: `workspace ${name} has not synced yet: its repositories are not on its volume`,
      };
    }
    const selected = this.selectionOf(workspace.sources).selected.map(
      ({ repository }) => repository,
    );
    const ungranted = [
      ...new Set(
        selected
          .map(r => providerOf(r.provider))
          .filter((p): p is FixtureProvider => Boolean(p && !p.connected)),
      ),
    ];
    if (ungranted.length > 0) {
      return {
        workspace: name,
        outcome: 'connect_required',
        reason: `grant ${ungranted
          .map(p => p.name)
          .join(
            ', ',
          )} in muster to use workspace ${name}: the Session works as you there`,
        connect: ungranted.map(p => ({
          provider: p.name,
          signIn: signInOf(p),
        })),
      };
    }
    const unreadable = selected
      .filter(r => !r.readable)
      .map(fullName)
      .sort((a, b) => a.localeCompare(b));
    if (unreadable.length > 0) {
      return {
        workspace: name,
        outcome: 'refused',
        reason: `you cannot read ${unreadable.length} ${
          unreadable.length === 1 ? 'repository' : 'repositories'
        } of workspace ${name}: ${unreadable.join(', ')}`,
        unreadable,
      };
    }
    const lastSync = Date.parse(workspace.lastSync.time);
    return {
      workspace: name,
      outcome: 'granted',
      grant: `fixture-grant-${globalThis.crypto.randomUUID()}`,
      expiresAt: new Date(this.now() + GRANT_TTL_MS).toISOString(),
      repositories: selected.map(fullName),
      changed: selected
        .filter(r => Date.parse(r.pushedAt) > lastSync)
        .map(fullName),
    };
  }

  listProviders(): WorkspaceProvider[] {
    return FIXTURE_PROVIDERS.map(provider => ({
      name: provider.name,
      kind: provider.kind,
      host: provider.host,
      connected: provider.connected,
      ...(provider.connected
        ? { login: 'guest' }
        : { signIn: signInOf(provider) }),
    }));
  }

  /**
   * The owners the person reaches on a provider instance, with their own
   * sign-in; without their grant of its App, none, and how to grant it.
   */
  listOwners(
    installation: string,
    input: { organization: string; provider: string },
  ): {
    provider: string;
    owners: ProviderOwner[];
    signIn?: string;
    status?: 'grant_required';
    apps?: string[];
  } {
    this.mustBeMember(installation, 'list owners', textOf(input.organization));
    const provider = providerOf(input.provider);
    if (!provider) {
      throw new Error(`list owners: unknown provider "${input.provider}"`);
    }
    if (!provider.connected) {
      return {
        provider: provider.name,
        owners: [],
        signIn: signInOf(provider),
        status: 'grant_required',
        apps: [provider.name],
      };
    }
    return {
      provider: provider.name,
      owners: this.data.repositoryOwners
        .filter(owner => owner.provider === provider.name)
        .map(({ name, kind }) => ({ name, kind }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  listRepositories(
    installation: string,
    input: ListRepositoriesInput,
  ): RepositoriesPage {
    const operation = 'list repositories';
    this.mustBeMember(installation, operation, textOf(input.organization));
    if (!input.provider || !input.owner) {
      throw new Error(`${operation}: provider and owner are required`);
    }
    const provider = providerOf(input.provider);
    if (!provider) {
      throw invalid(
        operation,
        input.owner,
        `unknown provider instance "${input.provider}"`,
      );
    }
    // From the manager's own listing of the owner: it says nothing about
    // the person's access, so it needs no grant of theirs.
    const owned = this.repositoriesOf(provider.name, input.owner);
    const search = input.search?.toLowerCase() ?? '';
    const matching = owned.filter(
      r =>
        r.name.toLowerCase().includes(search) &&
        (!input.languages?.length ||
          (r.language !== undefined && input.languages.includes(r.language))) &&
        (!input.topics?.length ||
          input.topics.some(t => r.topics.includes(t))) &&
        (input.archived === undefined || r.archived === input.archived) &&
        (input.fork === undefined || r.fork === input.fork),
    );
    const { page, pageSize, items } = pageOf(matching, input);
    const languageCounts = facetCounts(
      owned.flatMap(r => (r.language ? [r.language] : [])),
    );
    const topicCounts = facetCounts(owned.flatMap(r => r.topics));
    return {
      provider: provider.name,
      owner: input.owner,
      total: matching.length,
      ownerTotal: owned.length,
      page,
      pageSize,
      repositories: items.map(r => ({
        name: r.name,
        ...(r.language && { language: r.language }),
        topics: r.topics,
        ...(r.archived && { archived: true }),
        ...(r.fork && { fork: true }),
        lastPush: r.pushedAt,
        sizeKiB: r.sizeKiB,
      })),
      languages: languageCounts.map(c => c.name).sort(),
      topics: topicCounts.map(c => c.name).sort(),
      languageCounts,
      topicCounts,
      withTopics: owned.filter(r => r.topics.length > 0).length,
    };
  }

  previewWorkspace(
    installation: string,
    input: PreviewWorkspaceInput,
  ): WorkspacePreview {
    const operation = 'preview workspace';
    let sources: WorkspaceSource[];
    let workspace: string | undefined;
    if ('workspace' in input && input.workspace) {
      workspace = input.workspace;
      sources = this.stored(installation, operation, workspace).sources;
    } else if ('organization' in input) {
      this.mustBeMember(installation, operation, textOf(input.organization));
      this.validate(operation, 'draft', input.sources);
      sources = input.sources;
    } else {
      throw new Error(
        `${operation}: a workspace, or an organization and sources, are required`,
      );
    }
    const selection = this.selectionOf(sources);
    const search = input.search?.toLowerCase() ?? '';
    const matching = selection.selected.filter(({ repository }) =>
      fullName(repository).toLowerCase().includes(search),
    );
    const { page, pageSize, items } = pageOf(matching, input);
    const providerSizeKiB = selection.selected.reduce(
      (sum, { repository }) => sum + repository.sizeKiB,
      0,
    );
    return {
      ...(workspace && { workspace }),
      total: selection.selected.length,
      excluded: selection.excluded,
      skippedArchived: selection.skippedArchived,
      skippedForks: selection.skippedForks,
      providerSizeKiB,
      estimatedVolumeSize: quantityOf(providerSizeKiB * 1024 * 1.5, 8),
      matching: matching.length,
      page,
      pageSize,
      repositories: items.map(({ repository, why }): PreviewRepository => ({
        provider: repository.provider,
        repository: fullName(repository),
        ...(repository.language && { language: repository.language }),
        topics: repository.topics,
        lastPush: repository.pushedAt,
        sizeKiB: repository.sizeKiB,
        why,
      })),
    };
  }
}

let state: WorkspaceManagerFixtureState | undefined;

/** The state every workspace-manager fixture reads: built on first use. */
export function workspaceManagerFixtureState(): WorkspaceManagerFixtureState {
  state ??= new WorkspaceManagerFixtureState();
  return state;
}
