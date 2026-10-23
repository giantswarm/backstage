/**
 * toolchain-manager's tool contract, as the portal calls it through muster.
 *
 * A toolchain is a named set of tools (`go`, `node`) published as its own OCI
 * image, which a coding agent's Session mounts read-only at
 * `/opt/kagent/tools/<name>` beside its Harness. A toolchain source is a git
 * repository whose CI checks and publishes them; the installation offers the
 * toolchains of its approved sources. The toolchain-manager lists and
 * describes them, adds sources, writes a new toolchain's Dockerfile from
 * picked packages and opens it as a pull request, all as the person, reading
 * and writing the sources with the person's grant of its GitHub App, which
 * muster keeps and attaches to every call. It speaks MCP only; the portal
 * reaches it as the signed-in person through the installation's muster, where
 * its tools appear as `x_toolchain-manager_<tool>`. The shapes here mirror
 * `internal/api` of giantswarm/toolchain-manager.
 */

import { looksNotConnected } from './agentManager';
import type { WorkspaceProvider } from './workspaceManager';

/** The MCPServer name muster registers the toolchain-manager under. */
export const TOOLCHAIN_MANAGER_SERVER = 'toolchain-manager';

/** The tools this plugin calls, by their toolchain-manager name. */
export const TOOLCHAIN_MANAGER_TOOLS = {
  listToolchains: 'list_toolchains',
  describeToolchain: 'describe_toolchain',
  listSources: 'list_sources',
  addSource: 'add_source',
  searchPackages: 'search_packages',
  addPackages: 'add_packages',
  createToolchain: 'create_toolchain',
  buildStatus: 'toolchain_build_status',
} as const;

export type ToolchainManagerTool =
  (typeof TOOLCHAIN_MANAGER_TOOLS)[keyof typeof TOOLCHAIN_MANAGER_TOOLS];

/** `x_<server>_<tool>`: how muster exposes an aggregated server's tool. */
export function toolchainManagerToolName(tool: ToolchainManagerTool): string {
  return `x_${TOOLCHAIN_MANAGER_SERVER}_${tool}`;
}

/** The capability agent-manager's `get_info` reports when Sessions mount toolchains. */
export const TOOLCHAINS_CAPABILITY = 'toolchains';

/**
 * An agent's default toolchains, `name[@version]` each, comma-separated: what
 * its Sessions mount unless the person starting one changes them. agent-manager
 * keeps it on the agent's HelmRelease and `Agent`.
 */
export const DEFAULT_TOOLCHAINS_ANNOTATION =
  'agent-platform.giantswarm.io/default-toolchains';

/**
 * What a tool answers instead of its data while it cannot read as the person:
 * `grant_required` with the App muster asks them to grant, or
 * `install_required` (add_source) with where the App is installed.
 */
export type ToolchainAnswer = {
  status?: 'grant_required' | 'install_required' | string;
  apps?: string[];
  installURL?: string;
  message?: string;
};

/** A published toolchain of an offered source, at its newest version. */
export type Toolchain = {
  name: string;
  source: string;
  repository: string;
  /** The newest published version, `vX.Y.Z`, or the one described. */
  version: string;
  /** That version's image, `<registry>/<name>:X.Y.Z`. */
  image: string;
  publishedAt?: string;
  releaseURL?: string;
  /** Every published version, newest first. */
  versions: string[];
};

/** An offered source whose toolchains could not be read as the person. */
export type UnreachableSource = {
  source: string;
  repository: string;
  reason: string;
};

export type ToolchainList = ToolchainAnswer & {
  toolchains: Toolchain[];
  unreachable?: UnreachableSource[];
};

/** A declared tool: its command and the command that prints its version. */
export type ToolchainTool = { name: string; version: string };

/** One published version and what its image declares. */
export type ToolchainDescription = Toolchain & {
  harnesses: string[];
  tools: ToolchainTool[];
  packages?: Record<string, string>;
  binaries?: Record<string, string>;
  egress?: string[];
  /** The manager wrote its Dockerfile; else it is hand-written. */
  written: boolean;
  dockerfile: string;
};

export type ToolchainDescribeResult = ToolchainAnswer & {
  toolchain?: ToolchainDescription;
};

/** A toolchain source: configured, or added by a person. */
export type ToolchainSource = {
  name: string;
  repository: string;
  url: string;
  registry: string;
  slackChannel?: string;
  origin: string;
  /** `Approved`, or `Pending` until an installation owner approves it. */
  phase: string;
  /** The installation offers its contract-checked toolchains. */
  offered: boolean;
  addedBy?: string;
  addedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
};

export type AddSourceInput = {
  repository: string;
  registry: string;
  slackChannel: string;
};

export type AddSourceResult = ToolchainAnswer & { source?: ToolchainSource };

/** A package of a package source, its version on each branch. */
export type ToolchainPackage = {
  name: string;
  description?: string;
  url?: string;
  versions: Record<string, string>;
};

export type PackageSearch = {
  source: string;
  branches: string[];
  packages: ToolchainPackage[];
};

/** The Dockerfile `add_packages` wrote, to pass on to `create_toolchain`. */
export type WrittenToolchain = {
  toolchain: string;
  path: string;
  dockerfile: string;
};

export type CreatedToolchain = {
  toolchain: string;
  source: string;
  repository: string;
  pull: number;
  pullURL: string;
  branch: string;
};

export type CreateToolchainResult = ToolchainAnswer & {
  created?: CreatedToolchain;
};

/** The build states of a toolchain's pull request, in order. */
export type ToolchainBuildState =
  | 'queued'
  | 'checking'
  | 'checked'
  | 'building'
  | 'published'
  | 'failed'
  | 'unreleased'
  | 'closed';

export type ToolchainBuild = {
  toolchain: string;
  source: string;
  repository: string;
  state: ToolchainBuildState;
  pull?: number;
  pullURL?: string;
  log?: string;
  jobs?: { name: string; state: string; url?: string }[];
  version?: string;
  image?: string;
  releaseURL?: string;
};

export type BuildStatusResult = ToolchainAnswer & { build?: ToolchainBuild };

/** A build that no longer moves on its own. */
export function isFinalBuildState(state: ToolchainBuildState): boolean {
  return (
    state === 'published' ||
    state === 'failed' ||
    state === 'unreleased' ||
    state === 'closed'
  );
}

/** A build state as the create page says it. */
export const BUILD_STATE_LABEL: Record<ToolchainBuildState, string> = {
  queued: 'Queued: no check has started',
  checking: 'Checking: the toolchain contract runs',
  checked: 'Checked: waiting for the pull request to be merged',
  building: 'Building: merged, the release runs',
  published: 'Published',
  failed: 'Failed',
  unreleased: 'Merged without a release',
  closed: 'Closed without a merge',
};

/**
 * The muster App the answer asks the person to grant, as the provider the
 * shared sign-in prompt takes; `undefined` unless the answer is
 * `grant_required`.
 */
export function grantProvider(
  answer: ToolchainAnswer | undefined,
): WorkspaceProvider | undefined {
  const app = answer?.status === 'grant_required' ? answer.apps?.[0] : '';
  if (!app) {
    return undefined;
  }
  return {
    name: app,
    kind: 'github',
    connected: false,
    signIn: `core_auth_login app=${app}`,
  };
}

/** `v0.2.0` as the version a Session names: the image's tag, `0.2.0`. */
export function imageTag(version: string): string {
  return version.replace(/^v/, '');
}

/** A toolchain a Session mounts: its name and version, `latest` without one. */
export type ToolchainPick = { name: string; version?: string };

/** `go@0.1.0`, or `go` for its latest: how `start_session` names a toolchain. */
export function toolchainEntry({ name, version }: ToolchainPick): string {
  return version ? `${name}@${imageTag(version)}` : name;
}

/** `go@0.1.0` → `{name: 'go', version: '0.1.0'}`; `latest` is no version. */
export function parseToolchainEntry(entry: string): ToolchainPick {
  const [name, version] = entry.trim().split('@', 2);
  return version && version !== 'latest' ? { name, version } : { name };
}

/** An agent's default toolchains, read off its annotation. */
export function defaultToolchainsOf(
  annotation: string | undefined,
): ToolchainPick[] {
  return (annotation ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(parseToolchainEntry);
}

/** "go 0.1.0, node latest": a set of toolchains in a line. */
export function toolchainsLabel(picks: readonly ToolchainPick[]): string {
  return picks.length === 0
    ? 'No toolchains'
    : picks
        .map(
          pick =>
            `${pick.name} ${pick.version ? imageTag(pick.version) : 'latest'}`,
        )
        .join(', ');
}

/** Whether two sets of toolchains mount the same images. */
export function samePicks(
  a: readonly ToolchainPick[],
  b: readonly ToolchainPick[],
): boolean {
  const key = (picks: readonly ToolchainPick[]) =>
    picks
      .map(toolchainEntry)
      .sort((x, y) => x.localeCompare(y))
      .join(',');
  return key(a) === key(b);
}

export type ToolchainManagerErrorKind = 'unavailable' | 'failed';

/** A toolchain-manager call that failed, by kind. */
export class ToolchainManagerError extends Error {
  readonly name = 'ToolchainManagerError';
  constructor(
    readonly kind: ToolchainManagerErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * What a tool call threw: muster's "not connected" answers (the tool missing
 * from the person's session) are `unavailable`; anything else is `failed`,
 * verbatim.
 */
export function classifyToolchainManagerError(
  error: unknown,
): ToolchainManagerError {
  if (error instanceof ToolchainManagerError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new ToolchainManagerError(
    looksNotConnected(message) ? 'unavailable' : 'failed',
    message,
    { cause: error },
  );
}
