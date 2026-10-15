/**
 * workspace-manager's tool contract, as the portal calls it through muster.
 *
 * workspace-manager manages workspaces: the sources an agent Session works on
 * (one owner on one provider instance each, selected by name, language and
 * topics), synced on a cycle into bare mirrors on the workspace's one
 * read-write-many volume, with a directory per Session on it. It checks on
 * every call that the caller is a member of the workspace's Organization and
 * keeps the person's own provider sign-ins, against which `authorize_workspace`
 * checks the person reads every repository before a Session starts. It speaks
 * MCP only; the portal reaches it as the signed-in person through the
 * installation's muster, where its tools appear as `x_workspace-manager_<tool>`.
 * The shapes here mirror `internal/api` of giantswarm/workspace-manager.
 */

import { looksNotConnected } from './agentManager';

/** The MCPServer name muster registers workspace-manager under. */
export const WORKSPACE_MANAGER_SERVER = 'workspace-manager';

/** The tools this plugin calls, by their workspace-manager name. */
export const WORKSPACE_MANAGER_TOOLS = {
  listWorkspaces: 'list_workspaces',
  getWorkspace: 'get_workspace',
  createWorkspace: 'create_workspace',
  updateWorkspace: 'update_workspace',
  deleteWorkspace: 'delete_workspace',
  syncWorkspace: 'sync_workspace',
  listRepositories: 'list_repositories',
  previewWorkspace: 'preview_workspace',
  authorizeWorkspace: 'authorize_workspace',
  listProviders: 'list_providers',
  connectProvider: 'connect_provider',
  disconnectProvider: 'disconnect_provider',
} as const;

export type WorkspaceManagerTool =
  (typeof WORKSPACE_MANAGER_TOOLS)[keyof typeof WORKSPACE_MANAGER_TOOLS];

/** `x_<server>_<tool>`: how muster exposes an aggregated server's tool. */
export function workspaceManagerToolName(tool: WorkspaceManagerTool): string {
  return `x_${WORKSPACE_MANAGER_SERVER}_${tool}`;
}

/** How a topic filter combines its topics: any (the default) or all. */
export type TopicMatch = 'any' | 'all';

/** The filters of a source; a repository matches every filter set. */
export type WorkspaceFilters = {
  /** Repositories whose primary language is any of these. */
  languages?: string[];
  topics?: { match?: TopicMatch; names: string[] };
};

/**
 * One owner on one provider instance, with at least one selector: repositories
 * by name (which count even when archived or a fork), or the filters.
 */
export type WorkspaceSource = {
  /** The provider instance's name, as `list_providers` shows it. */
  provider: string;
  /** The account on the provider: an organization or a user. */
  owner: string;
  repositories?: string[];
  filters?: WorkspaceFilters;
  /** Repositories the filters would otherwise select. */
  exclude?: string[];
  includeArchived?: boolean;
  includeForks?: boolean;
};

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

/**
 * When the mirrors are fetched: nightly (the default), weekly, or custom
 * weekdays at an hour (UTC). A workspace also syncs after every change and on
 * request.
 */
export type WorkspaceSyncCycle =
  | { schedule: 'nightly' | 'weekly' }
  | { schedule: 'custom'; weekdays: Weekday[]; hour: number };

/** The volume's sizing overrides, as Kubernetes quantities (`8Gi`). */
export type WorkspaceSizing = {
  /** Replaces the computed headroom when larger. */
  headroom?: string;
  /** The smallest size the volume gets. */
  minimum?: string;
};

/** What started a sync cycle. */
export type SyncTrigger =
  'schedule' | 'change' | 'request' | 'retry' | 'deletion';

/** The last sync cycle's outcome. */
export type LastSync = {
  time: string;
  result: 'Succeeded' | 'Failed' | 'NoChange';
  trigger?: SyncTrigger;
  /** The sync Job the cycle ran; absent for a cycle that ran none. */
  job?: string;
  message?: string;
};

/** The sync Job running now. */
export type ActiveSync = {
  job: string;
  startedAt: string;
  trigger?: SyncTrigger;
};

/** A `sync_workspace` request the controller has not taken up yet. */
export type SyncRequest = {
  requestedAt: string;
  requestedBy?: string;
};

/** The workspace's one volume, by its claim and its CSI handle once bound. */
export type WorkspaceVolume = {
  claimName?: string;
  driver?: string;
  /** The handle a Session's volume reference names. */
  handle?: string;
  /** Why there is no CSI handle yet. */
  pending?: string;
};

export type WorkspaceCondition = {
  type: string;
  status: string;
  reason?: string;
  message?: string;
};

/** A workspace as `list_workspaces` and the writes return it. */
export type Workspace = {
  name: string;
  /** The Organization the workspace belongs to, for good. */
  organization: string;
  sources: WorkspaceSource[];
  sync: WorkspaceSyncCycle;
  sizing?: WorkspaceSizing;
  /** What `update_workspace` refuses a stale write against. */
  resourceVersion: string;
  createdAt: string;
  /** Being deleted: no new Session starts on it. */
  deleting?: boolean;
  lastSync?: LastSync;
  /** When the schedule starts the next cycle; absent while deleting. */
  nextSync?: string;
  activeSync?: ActiveSync;
  syncRequest?: SyncRequest;
  /** The number of repositories the last sync resolved. */
  repositories: number;
  volume?: WorkspaceVolume;
  /** What the volume needs and has, where its StorageClass provisions a size. */
  neededSize?: string;
  volumeSize?: string;
  /** The number of Session directories on the volume. */
  sessions: number;
  /**
   * What the volume stores, mirrors and Session directories, measured at the
   * last sync; absent before the first, and from a manager that predates it.
   */
  storedBytes?: number;
  /** The share's size before the last sync grew it; absent when it did not. */
  grewFrom?: string;
  conditions?: WorkspaceCondition[];
};

/** One repository on the volume, as the last sync measured it. */
export type WorkspaceMirror = {
  provider: string;
  /** `<owner>/<name>`. */
  repository: string;
  defaultBranch?: string;
  /** The head commit the mirror holds. */
  head?: string;
  pushedAt: string;
  sizeBytes: number;
  /** Left the selection; the mirror stays while a Session borrows from it. */
  droppedAt?: string;
};

/** What the volume stores, measured at the last sync. */
export type WorkspaceStorage = {
  mirrorsBytes: number;
  sessionsBytes: number;
  neededSize?: string;
  volumeSize?: string;
};

/** One Session's directory on the volume. */
export type SessionDirectory = {
  /** The Session's id; name, creator and lastTurn are kagent's. */
  session: string;
  name?: string;
  creator?: string;
  lastTurn?: string;
  /** A directory whose Session kagent does not list. */
  unknown?: boolean;
  sizeBytes: number;
  /** When the directory is deleted. */
  cleanupAfter?: string;
};

/**
 * `list_workspaces`: the workspaces of the caller's Organizations, and those
 * Organizations, with or without a workspace (workspace-manager 0.8.0 and
 * later; from an older manager, the workspaces' own Organizations).
 */
export type WorkspaceList = {
  workspaces: Workspace[];
  /** The caller's member Organizations, sorted. */
  organizations: string[];
};

/** `get_workspace`: the workspace with its mirrors, storage and Sessions. */
export type WorkspaceDetail = {
  workspace: Workspace;
  /** Empty before the first sync. */
  mirrors: WorkspaceMirror[];
  storage: WorkspaceStorage;
  sessionDirectories: SessionDirectory[];
};

export type CreateWorkspaceInput = {
  /** Lower-case letters, digits and '-', unique in the installation. */
  name: string;
  /** The caller must be a member. */
  organization: string;
  sources: WorkspaceSource[];
  /** Nightly when omitted. */
  sync?: WorkspaceSyncCycle;
  sizing?: WorkspaceSizing;
};

export type UpdateWorkspaceInput = {
  name: string;
  /** Replace the current sources. */
  sources: WorkspaceSource[];
  /** Kept when omitted. */
  sync?: WorkspaceSyncCycle;
  /** Kept when omitted; `{}` clears the overrides. */
  sizing?: WorkspaceSizing;
  /** From `get_workspace`: the update is refused when it changed since. */
  resourceVersion?: string;
};

/** `delete_workspace`: the Sessions that still have a directory on it. */
export type DeleteWorkspaceResult = {
  workspace: string;
  sessions: string[];
};

/** `sync_workspace`: the request, and the sync Job it waits behind. */
export type SyncWorkspaceResult = {
  workspace: string;
  requestedAt: string;
  requestedBy?: string;
  activeSync?: ActiveSync;
};

/** One page of a long answer: from 1, 50 per page by default, 200 at most. */
export type PageInput = {
  page?: number;
  pageSize?: number;
};

export type ListRepositoriesInput = PageInput & {
  /** The Organization whose workspace is edited; the caller must be a member. */
  organization: string;
  provider: string;
  owner: string;
  /** Repositories whose name contains this, ignoring case. */
  search?: string;
  languages?: string[];
  topics?: string[];
  /** true: only archived; false: none; omitted: both. */
  archived?: boolean;
  /** true: only forks; false: none; omitted: both. */
  fork?: boolean;
};

/** One repository as its provider lists it. */
export type ProviderRepository = {
  name: string;
  language?: string;
  topics: string[];
  archived?: boolean;
  fork?: boolean;
  lastPush: string;
  sizeKiB: number;
};

/** `list_repositories`: one page of an owner's repositories, for the picker. */
export type RepositoriesPage = {
  provider: string;
  owner: string;
  /** The repositories matching the search and filters. */
  total: number;
  /** The owner's repositories. */
  ownerTotal: number;
  page: number;
  pageSize: number;
  repositories: ProviderRepository[];
  /** Every language and topic the owner's repositories carry. */
  languages: string[];
  topics: string[];
};

/** `preview_workspace`: an existing workspace by name, or a draft. */
export type PreviewWorkspaceInput = PageInput &
  (
    | { workspace: string; search?: string }
    | {
        organization: string;
        sources: WorkspaceSource[];
        sizing?: WorkspaceSizing;
        search?: string;
      }
  );

/** One repository a selection holds now, and the selectors that take it. */
export type PreviewRepository = {
  provider: string;
  repository: string;
  language?: string;
  topics: string[];
  lastPush: string;
  sizeKiB: number;
  /** `name`, `language <l>`, `topic <t>`. */
  why: string[];
};

/** `preview_workspace`: what the selection holds now. */
export type WorkspacePreview = {
  workspace?: string;
  total: number;
  excluded: number;
  skippedArchived: number;
  skippedForks: number;
  providerSizeKiB: number;
  estimatedVolumeSize: string;
  /** The selected repositories matching the search. */
  matching: number;
  page: number;
  pageSize: number;
  repositories: PreviewRepository[];
};

/** A provider instance, with whether the person is connected to it. */
export type WorkspaceProvider = {
  name: string;
  kind: string;
  connected: boolean;
  connectURL: string;
};

const PROVIDER_KIND_NAMES: Record<string, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  gitea: 'Gitea',
  bitbucket: 'Bitbucket',
};

/** A provider kind as the provider spells it ("GitHub"), else as given. */
export function providerKindName(kind: string): string {
  return PROVIDER_KIND_NAMES[kind.toLowerCase()] ?? kind;
}

/**
 * A provider instance as people read it: the kind's own spelling ("GitHub")
 * when the instance is named after its kind, else the instance's name with
 * that spelling ("github-enterprise (GitHub)").
 */
export function providerDisplayName(
  provider: Pick<WorkspaceProvider, 'name' | 'kind'>,
): string {
  const kind = providerKindName(provider.kind);
  if (
    !provider.name ||
    provider.name.toLowerCase() === provider.kind.toLowerCase()
  ) {
    return kind;
  }
  return kind ? `${provider.name} (${kind})` : provider.name;
}

/** `connect_provider`: the person's own sign-in link, valid for minutes. */
export type ConnectProviderResult = {
  provider: string;
  authorizationURL: string;
  expiresAt: string;
};

/** `disconnect_provider`: false when there was nothing left to revoke. */
export type DisconnectProviderResult = {
  provider: string;
  revoked: boolean;
};

/** A provider the person connects before the workspace is theirs. */
export type ProviderConnect = {
  provider: string;
  url: string;
};

/**
 * `authorize_workspace`: may the person start a Session on the workspace?
 * Granted carries the grant, opaque to the portal, which `start_session`
 * takes; refused names the unreadable repositories or why the workspace cannot
 * be started on yet; connect_required names the providers to connect first.
 */
export type WorkspaceAuthorization = {
  workspace: string;
  outcome: 'granted' | 'refused' | 'connect_required';
  /** Why, for every outcome but granted. */
  reason?: string;
  grant?: string;
  expiresAt?: string;
  /** `<owner>/<name>`. */
  repositories?: string[];
  /** Pushed to since the last sync: fetched before the Session's first turn. */
  changed?: string[];
  unreadable?: string[];
  connect?: ProviderConnect[];
};

/**
 * How a workspace-manager call failed:
 * `not_member` — the caller is not a member of the workspace's Organization
 * (workspace-manager's own check from the forwarded groups, or, once
 * workspaces live in the Organization's namespace, the Kubernetes permission
 * refusal); `refused` — the person cannot read the repositories named;
 * `not_connected` — the person has not connected the provider instances
 * named, each with its connect link; `invalid` — the manager's validation
 * message; `not_found`, `already_exists`, `conflict` (changed since read);
 * `unavailable` — the installation's muster does not reach workspace-manager
 * for this person; `failed` — anything else, verbatim.
 */
export type WorkspaceManagerErrorKind =
  | 'not_member'
  | 'refused'
  | 'not_connected'
  | 'invalid'
  | 'not_found'
  | 'already_exists'
  | 'conflict'
  | 'unavailable'
  | 'failed';

/** A failed workspace-manager call, in the manager's own words. */
export class WorkspaceManagerError extends Error {
  readonly name = 'WorkspaceManagerError';
  constructor(
    readonly kind: WorkspaceManagerErrorKind,
    message: string,
    /** `refused`: the repositories the person cannot read. */
    readonly repositories: string[] = [],
    /** `not_connected`: the providers to connect, with their links. */
    readonly connect: ProviderConnect[] = [],
  ) {
    super(message);
  }
}

/**
 * The tool's refusals by their wording (`toolError` in internal/api): the
 * operation, then the class. The `forbidden:` and Kubernetes `is forbidden:`
 * shapes are the membership refusals of the two checks.
 */
const ERROR_PATTERNS: ReadonlyArray<[WorkspaceManagerErrorKind, RegExp]> = [
  ['not_member', /: permission denied: /],
  ['not_member', /is not a member of Organization/],
  ['not_member', /\bis forbidden: User\b/],
  ['invalid', /: invalid workspace: /],
  ['invalid', /^invalid arguments: /],
  ['invalid', /^required argument /],
  ['invalid', /unknown provider/],
  ['invalid', /\bare required$/],
  ['not_found', /: not found: /],
  ['already_exists', /: already exists: /],
  ['conflict', /: the workspace changed since it was read/],
];

/**
 * Classifies what a tool call threw: workspace-manager's refusals become
 * {@link WorkspaceManagerError} of their kind; muster's "not connected"
 * answers (the tool missing from the person's session) are `unavailable`;
 * anything else is `failed`, verbatim.
 */
export function classifyWorkspaceManagerError(
  error: unknown,
): WorkspaceManagerError {
  if (error instanceof WorkspaceManagerError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  const match = ERROR_PATTERNS.find(([, pattern]) => pattern.test(message));
  if (match) {
    return new WorkspaceManagerError(match[0], message);
  }
  if (looksNotConnected(message)) {
    return new WorkspaceManagerError('unavailable', message);
  }
  return new WorkspaceManagerError('failed', message);
}

/**
 * An `authorize_workspace` answer other than granted, as the error a Session
 * start shows: `not_connected` with the providers and their links, or
 * `refused` with the unreadable repositories (none when the workspace cannot
 * be started on yet, the reason says why). `undefined` for a grant.
 */
export function authorizationError(
  authorization: WorkspaceAuthorization,
): WorkspaceManagerError | undefined {
  const reason =
    authorization.reason ?? `workspace ${authorization.workspace} refused`;
  switch (authorization.outcome) {
    case 'granted':
      return undefined;
    case 'connect_required':
      return new WorkspaceManagerError(
        'not_connected',
        reason,
        [],
        authorization.connect ?? [],
      );
    default:
      return new WorkspaceManagerError(
        'refused',
        reason,
        authorization.unreadable ?? [],
      );
  }
}
