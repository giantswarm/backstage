/**
 * A workspace-manager behind a fake muster `callTool`, for the editor's
 * tests: providers, owners' repositories (searched, filtered and paged as
 * the manager does), a preview resolved from the draft's sources, and the
 * writes, with every call recorded.
 */

import type {
  PreviewRepository,
  ProviderRepository,
  Workspace,
  WorkspaceProvider,
  WorkspaceSource,
} from '../../lib/workspaceManager';

export type FakeRepository = ProviderRepository & {
  provider: string;
  owner: string;
};

export type FakeCall = { tool: string; args: Record<string, any> };

export type WorkspaceManagerFake = {
  callTool: jest.Mock;
  listServers: jest.Mock;
  listInstallations: jest.Mock;
  getAuthStatus: jest.Mock;
  signInServer: jest.Mock;
  /** The muster servers granting a provider's App, by state; mutable. */
  grants: Record<string, 'connected' | 'auth_required'>;
  calls: FakeCall[];
  callsOf: (tool: string) => Array<Record<string, any>>;
  /** Replaces the answer of a write: throw to refuse it. */
  onWrite: (
    tool: 'create_workspace' | 'update_workspace',
    handler: (args: any) => unknown,
  ) => void;
  providers: WorkspaceProvider[];
};

const PREFIX = 'x_workspace-manager_';

function pageOf<T>(items: T[], page = 1, pageSize = 50) {
  return items.slice((page - 1) * pageSize, page * pageSize);
}

function selects(
  source: WorkspaceSource,
  repository: FakeRepository,
): string[] {
  if (
    repository.provider !== source.provider ||
    repository.owner !== source.owner ||
    source.exclude?.includes(repository.name)
  ) {
    return [];
  }
  const why: string[] = [];
  if (source.repositories?.includes(repository.name)) {
    why.push('name');
  }
  const filters = source.filters;
  if (filters && (filters.languages?.length || filters.topics?.names.length)) {
    if (repository.archived && !source.includeArchived) {
      return why;
    }
    if (repository.fork && !source.includeForks) {
      return why;
    }
    const language =
      !filters.languages?.length ||
      filters.languages.includes(repository.language ?? '');
    const names = filters.topics?.names ?? [];
    const topic =
      names.length === 0 ||
      (filters.topics?.match === 'all'
        ? names.every(t => repository.topics.includes(t))
        : names.some(t => repository.topics.includes(t)));
    if (language && topic) {
      if (filters.languages?.length) {
        why.push(`language ${repository.language}`);
      }
      for (const t of names.filter(n => repository.topics.includes(n))) {
        why.push(`topic ${t}`);
      }
    }
  }
  return why;
}

export function createWorkspaceManagerFake({
  providers,
  repositories,
  workspaces = [],
  managerSignIn = 'connected',
  grants = {},
}: {
  providers: WorkspaceProvider[];
  repositories: FakeRepository[];
  workspaces?: Workspace[];
  /** workspace-manager in the person's muster session (`auth://status`). */
  managerSignIn?: 'connected' | 'auth_required';
  /**
   * The muster servers whose sign-in grants a provider's App (the
   * providers' `signIn`), by their state; a test flips one to `connected`.
   */
  grants?: Record<string, 'connected' | 'auth_required'>;
}): WorkspaceManagerFake {
  const calls: FakeCall[] = [];
  const writes: Record<string, (args: any) => unknown> = {
    create_workspace: args => ({
      ...args,
      resourceVersion: '1',
      createdAt: '2026-10-14T00:00:00Z',
      repositories: 0,
      sessions: 0,
      sync: { schedule: 'nightly' },
    }),
    update_workspace: args => ({ ...args, resourceVersion: '2' }),
  };

  const tools: Record<string, (args: any) => unknown> = {
    // A copy per answer, as over the wire: a test changes `providers` between reads.
    list_providers: () => ({ providers: providers.map(p => ({ ...p })) }),
    list_repositories: args => {
      const search = (args.search ?? '').toLowerCase();
      const ofOwner = repositories.filter(
        r => r.provider === args.provider && r.owner === args.owner,
      );
      const matching = ofOwner.filter(
        r =>
          (!search || r.name.toLowerCase().includes(search)) &&
          (!args.languages?.length || args.languages.includes(r.language)) &&
          (!args.topics?.length ||
            args.topics.some((t: string) => r.topics.includes(t))) &&
          (args.archived === undefined ||
            Boolean(r.archived) === args.archived) &&
          (args.fork === undefined || Boolean(r.fork) === args.fork),
      );
      const pageSize = args.pageSize ?? 50;
      return {
        provider: args.provider,
        owner: args.owner,
        total: matching.length,
        ownerTotal: ofOwner.length,
        page: args.page ?? 1,
        pageSize,
        repositories: pageOf(matching, args.page, pageSize).map(
          ({ provider: _p, owner: _o, ...repository }) => repository,
        ),
        languages: [
          ...new Set(ofOwner.flatMap(r => (r.language ? [r.language] : []))),
        ].sort(),
        topics: [...new Set(ofOwner.flatMap(r => r.topics))].sort(),
      };
    },
    preview_workspace: args => {
      const sources: WorkspaceSource[] = args.sources;
      let excluded = 0;
      const selected: PreviewRepository[] = [];
      for (const repository of repositories) {
        const why = sources.flatMap(source => selects(source, repository));
        if (
          sources.some(
            s =>
              s.provider === repository.provider &&
              s.owner === repository.owner &&
              s.exclude?.includes(repository.name),
          )
        ) {
          excluded += 1;
        }
        if (why.length > 0) {
          selected.push({
            provider: repository.provider,
            repository: `${repository.owner}/${repository.name}`,
            language: repository.language,
            topics: repository.topics,
            lastPush: repository.lastPush,
            sizeKiB: repository.sizeKiB,
            why,
          });
        }
      }
      const search = (args.search ?? '').toLowerCase();
      const matching = selected.filter(r =>
        r.repository.toLowerCase().includes(search),
      );
      const sizeKiB = selected.reduce((sum, r) => sum + r.sizeKiB, 0);
      return {
        total: selected.length,
        excluded,
        skippedArchived: 0,
        skippedForks: 0,
        providerSizeKiB: sizeKiB,
        estimatedVolumeSize: `${Math.max(1, Math.ceil(sizeKiB / 1024 / 1024) * 2)}Gi`,
        matching: matching.length,
        page: args.page ?? 1,
        pageSize: args.pageSize ?? 50,
        repositories: pageOf(matching, args.page, args.pageSize),
      };
    },
    get_workspace: args => {
      const workspace = workspaces.find(w => w.name === args.workspace);
      if (!workspace) {
        throw new Error(`get_workspace: not found: ${args.workspace}`);
      }
      return {
        workspace,
        mirrors: [],
        storage: { mirrorsBytes: 0, sessionsBytes: 0 },
        sessionDirectories: [],
      };
    },
  };

  const callTool = jest.fn(async (name: string, args: Record<string, any>) => {
    const tool = name.replace(PREFIX, '');
    calls.push({ tool, args });
    const handler = writes[tool] ?? tools[tool];
    if (!handler) {
      throw new Error(`unexpected tool ${name}`);
    }
    return handler(args);
  });
  const listServers = jest.fn(async () => ({
    mcpServers: [{ name: 'workspace-manager' }],
  }));
  // Every installation's muster signs the person in, so the manager's tools
  // run as the person.
  const listInstallations = jest.fn(async () => ({
    installations: [{ name: 'lab', requiresAuth: true }],
  }));
  const getAuthStatus = jest.fn(async () => ({
    servers: [
      { name: 'workspace-manager', status: managerSignIn },
      ...Object.entries(grants).map(([name, status]) => ({ name, status })),
    ],
  }));
  const signInServer = jest.fn(async (server: string) => ({
    status: 'auth_required',
    authUrl: `https://sign-in.example/${server}`,
  }));

  return {
    callTool,
    listServers,
    listInstallations,
    getAuthStatus,
    signInServer,
    grants,
    calls,
    callsOf: tool => calls.filter(c => c.tool === tool).map(c => c.args),
    onWrite: (tool, handler) => {
      writes[tool] = handler;
    },
    providers,
  };
}

/** `count` repositories of one owner: every third Go, every fifth tagged mcp. */
export function manyRepositories(
  provider: string,
  owner: string,
  count: number,
): FakeRepository[] {
  return Array.from({ length: count }, (_, i) => ({
    provider,
    owner,
    name: `repo-${String(i).padStart(3, '0')}`,
    language: i % 3 === 0 ? 'Go' : 'TypeScript',
    topics: i % 5 === 0 ? ['mcp'] : [],
    lastPush: '2026-10-01T00:00:00Z',
    sizeKiB: 1024,
  }));
}
