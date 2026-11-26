import {
  MusterUnauthorizedError,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { PortalSessionEndedError } from '../lib/portalSession';
import {
  authorizationError,
  providerSignInTarget,
  WorkspaceManagerError,
  type Workspace,
  type WorkspaceDetail,
} from '../lib/workspaceManager';
import { WorkspaceManagerClient } from './WorkspaceManagerClient';

function makeMusterApi(answer: unknown = {}) {
  const callTool = jest.fn(
    async (
      _name: string,
      _args: Record<string, unknown>,
      _installation?: string,
    ): Promise<unknown> => answer,
  );
  return { api: { callTool } as unknown as MusterApi, callTool };
}

/**
 * The portal's backend refusing the session token before muster-backend runs:
 * Backstage's `AuthenticationError`, which muster's client keeps as
 * `errorName`.
 */
const portalRefusal = () =>
  new MusterUnauthorizedError(
    'Failed user token verification',
    undefined,
    undefined,
    'gazelle',
    'AuthenticationError',
  );

const WORKSPACE: Workspace = {
  name: 'platform',
  organization: 'acme',
  sources: [
    {
      provider: 'github',
      owner: 'acme',
      repositories: ['api'],
      filters: { languages: ['Go'], topics: { match: 'any', names: ['ops'] } },
      exclude: ['legacy'],
    },
  ],
  sizing: { headroom: '8Gi', minimum: '32Gi' },
  resourceVersion: '4711',
  createdAt: '2026-10-01T08:00:00Z',
  lastSync: {
    time: '2026-10-12T02:00:00Z',
    result: 'Succeeded',
    trigger: 'change',
    job: 'platform-sync-29341',
  },
  repositories: 12,
  volume: {
    claimName: 'workspace-platform',
    driver: 'efs.csi.aws.com',
    handle: 'fs-0123::fsap-0456',
  },
  neededSize: '20Gi',
  volumeSize: '32Gi',
  sessions: 1,
};

const DETAIL: WorkspaceDetail = {
  workspace: WORKSPACE,
  mirrors: [
    {
      provider: 'github',
      repository: 'acme/api',
      defaultBranch: 'main',
      head: '3f2a9c1',
      pushedAt: '2026-10-11T17:00:00Z',
      sizeBytes: 2_000_000,
    },
  ],
  storage: {
    mirrorsBytes: 2_000_000,
    sessionsBytes: 500_000,
    neededSize: '20Gi',
    volumeSize: '32Gi',
  },
  sessionDirectories: [
    {
      session: 'ses-1',
      name: 'Fix the flaky test',
      creator: 'alice@example.com',
      lastTurn: '2026-10-12T09:00:00Z',
      sizeBytes: 500_000,
      cleanupAfter: '2026-11-11T09:00:00Z',
    },
  ],
};

describe('WorkspaceManagerClient', () => {
  it.each([
    [
      'listWorkspaces',
      (c: WorkspaceManagerClient) => c.listWorkspaces('acme'),
      'x_workspace-manager_list_workspaces',
      { organization: 'acme' },
      { workspaces: [WORKSPACE], organizations: ['acme', 'beta'] },
      { workspaces: [WORKSPACE], organizations: ['acme', 'beta'] },
    ],
    [
      'listWorkspaces from a manager that names no Organizations',
      (c: WorkspaceManagerClient) => c.listWorkspaces(),
      'x_workspace-manager_list_workspaces',
      {},
      { workspaces: [WORKSPACE] },
      { workspaces: [WORKSPACE], organizations: ['acme'] },
    ],
    [
      'listWorkspaces of every Organization',
      (c: WorkspaceManagerClient) => c.listWorkspaces(),
      'x_workspace-manager_list_workspaces',
      {},
      { workspaces: [], organizations: ['acme'] },
      { workspaces: [], organizations: ['acme'] },
    ],
    [
      'getWorkspace',
      (c: WorkspaceManagerClient) => c.getWorkspace('platform'),
      'x_workspace-manager_get_workspace',
      { workspace: 'platform' },
      DETAIL,
      DETAIL,
    ],
    [
      'createWorkspace',
      (c: WorkspaceManagerClient) =>
        c.createWorkspace({
          name: 'platform',
          organization: 'acme',
          sources: WORKSPACE.sources,
          sizing: { minimum: '32Gi' },
        }),
      'x_workspace-manager_create_workspace',
      {
        name: 'platform',
        organization: 'acme',
        sources: WORKSPACE.sources,
        sizing: { minimum: '32Gi' },
      },
      WORKSPACE,
      WORKSPACE,
    ],
    [
      'updateWorkspace',
      (c: WorkspaceManagerClient) =>
        c.updateWorkspace({
          name: 'platform',
          sources: WORKSPACE.sources,
          resourceVersion: '4711',
        }),
      'x_workspace-manager_update_workspace',
      { name: 'platform', sources: WORKSPACE.sources, resourceVersion: '4711' },
      WORKSPACE,
      WORKSPACE,
    ],
    [
      'deleteWorkspace',
      (c: WorkspaceManagerClient) => c.deleteWorkspace('platform'),
      'x_workspace-manager_delete_workspace',
      { workspace: 'platform' },
      { workspace: 'platform', sessions: ['ses-1'] },
      { workspace: 'platform', sessions: ['ses-1'] },
    ],
    [
      'syncWorkspace',
      (c: WorkspaceManagerClient) => c.syncWorkspace('platform'),
      'x_workspace-manager_sync_workspace',
      { workspace: 'platform' },
      {
        workspace: 'platform',
        requestedAt: '2026-10-12T10:00:00Z',
        requestedBy: 'alice@example.com',
      },
      {
        workspace: 'platform',
        requestedAt: '2026-10-12T10:00:00Z',
        requestedBy: 'alice@example.com',
      },
    ],
    [
      'listRepositories',
      (c: WorkspaceManagerClient) =>
        c.listRepositories({
          organization: 'acme',
          provider: 'github',
          owner: 'acme',
          search: 'ap',
          languages: ['Go'],
          archived: false,
          page: 2,
          pageSize: 20,
        }),
      'x_workspace-manager_list_repositories',
      {
        organization: 'acme',
        provider: 'github',
        owner: 'acme',
        search: 'ap',
        languages: ['Go'],
        archived: false,
        page: 2,
        pageSize: 20,
      },
      {
        provider: 'github',
        owner: 'acme',
        total: 21,
        ownerTotal: 140,
        page: 2,
        pageSize: 20,
        repositories: [
          {
            name: 'api',
            language: 'Go',
            topics: ['ops'],
            lastPush: '2026-10-11T17:00:00Z',
            sizeKiB: 1953,
          },
        ],
        languages: ['Go', 'TypeScript'],
        topics: ['ops'],
      },
      expect.objectContaining({ total: 21, ownerTotal: 140, page: 2 }),
    ],
    [
      'previewWorkspace of a draft',
      (c: WorkspaceManagerClient) =>
        c.previewWorkspace({
          organization: 'acme',
          sources: WORKSPACE.sources,
        }),
      'x_workspace-manager_preview_workspace',
      { organization: 'acme', sources: WORKSPACE.sources },
      {
        total: 12,
        excluded: 1,
        skippedArchived: 2,
        skippedForks: 0,
        providerSizeKiB: 20480,
        estimatedVolumeSize: '32Gi',
        matching: 12,
        page: 1,
        pageSize: 50,
        repositories: [],
      },
      expect.objectContaining({ total: 12, estimatedVolumeSize: '32Gi' }),
    ],
    [
      'authorizeWorkspace',
      (c: WorkspaceManagerClient) => c.authorizeWorkspace('platform'),
      'x_workspace-manager_authorize_workspace',
      { workspace: 'platform' },
      {
        workspace: 'platform',
        outcome: 'granted',
        grant: 'eyJhbGciOiJFUzI1NiJ9.e30.sig',
        expiresAt: '2026-10-12T10:05:00Z',
        repositories: ['acme/api'],
        changed: ['acme/api'],
      },
      expect.objectContaining({
        outcome: 'granted',
        grant: 'eyJhbGciOiJFUzI1NiJ9.e30.sig',
      }),
    ],
    [
      'listProviders',
      (c: WorkspaceManagerClient) => c.listProviders(),
      'x_workspace-manager_list_providers',
      {},
      {
        providers: [
          {
            name: 'github',
            kind: 'github',
            connected: false,
            signIn:
              'muster holds no grant for provider github: the workspace-manager is pinned to the App of provider gitlab only',
          },
          { name: 'gitlab', kind: 'gitlab', connected: true },
        ],
      },
      [
        {
          name: 'github',
          kind: 'github',
          connected: false,
          signIn:
            'muster holds no grant for provider github: the workspace-manager is pinned to the App of provider gitlab only',
        },
        { name: 'gitlab', kind: 'gitlab', connected: true },
      ],
    ],
  ])(
    '%s calls its tool on the installation and parses the answer',
    async (_label, call, tool, args, answer, parsed) => {
      const { api, callTool } = makeMusterApi(answer);
      const client = new WorkspaceManagerClient(api, 'lab');

      await expect(call(client)).resolves.toEqual(parsed);
      expect(callTool).toHaveBeenCalledWith(tool, args, 'lab');
    },
  );

  it('parses an answer the proxy left as JSON text', async () => {
    const { api } = makeMusterApi(JSON.stringify({ workspaces: [WORKSPACE] }));
    const client = new WorkspaceManagerClient(api, 'lab');

    await expect(client.listWorkspaces()).resolves.toEqual({
      workspaces: [WORKSPACE],
      organizations: ['acme'],
    });
  });

  it('fails on prose where the data was expected', async () => {
    const { api } = makeMusterApi('1 workspaces');
    const client = new WorkspaceManagerClient(api, 'lab');

    await expect(client.listWorkspaces()).rejects.toMatchObject({
      kind: 'failed',
      message: expect.stringContaining('answered text, not JSON: 1 workspaces'),
    });
  });

  it('throws a refusal classified', async () => {
    const { api, callTool } = makeMusterApi();
    callTool.mockRejectedValue(
      new Error(
        'list workspaces: permission denied: forbidden: bob@example.com is not a member of Organization "acme"',
      ),
    );
    const client = new WorkspaceManagerClient(api, 'lab');

    const error = await client.listWorkspaces('acme').catch(e => e);
    expect(error).toBeInstanceOf(WorkspaceManagerError);
    expect(error.kind).toBe('not_member');
  });

  it('throws unavailable where muster does not reach workspace-manager', async () => {
    const { api, callTool } = makeMusterApi();
    callTool.mockRejectedValue(
      new Error('tool not found: x_workspace-manager_list_providers'),
    );
    const client = new WorkspaceManagerClient(api, 'lab');

    await expect(client.listProviders()).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('says the portal session ended when the portal refuses the session token', async () => {
    const { api, callTool } = makeMusterApi();
    callTool.mockRejectedValue(portalRefusal());
    const client = new WorkspaceManagerClient(api, 'lab');

    const error = await client.listWorkspaces('acme').catch(e => e);
    expect(error).toBeInstanceOf(PortalSessionEndedError);
    expect(error.message).not.toMatch(/token verification/);
  });

  describe("muster's answer for a provider App the person has not granted", () => {
    /**
     * muster's `auth_required` tool error in place of workspace-manager's
     * `connect_required`, as muster-backend answers it: a 401 with the Apps
     * from muster's `structuredContent.apps`.
     */
    const appGrantRequired = () =>
      new MusterUnauthorizedError(
        "auth_required: server 'workspace-manager' requires authentication: it needs your grant of a provider App (github) for this call.",
        'server_sign_in_required',
        'workspace-manager',
        'lab',
        'MusterUnauthorizedError',
        [
          {
            app: 'github',
            authUrl: 'https://muster.example/oauth/proxy/start?state=s1',
          },
        ],
      );

    it('reads it as not_connected with the sign-in to each App', async () => {
      const { api, callTool } = makeMusterApi();
      callTool.mockRejectedValue(appGrantRequired());
      const client = new WorkspaceManagerClient(api, 'lab');

      const error = await client.authorizeWorkspace('portal').catch(e => e);
      expect(error).toBeInstanceOf(WorkspaceManagerError);
      expect(error.kind).toBe('not_connected');
      expect(error.connect).toEqual([
        { provider: 'github', app: 'github', signIn: expect.any(String) },
      ]);
      expect(providerSignInTarget(error.connect[0].signIn)).toEqual({
        name: 'github',
        app: true,
      });
    });

    it('keeps a sign-in to the server itself unavailable', async () => {
      const { api, callTool } = makeMusterApi();
      callTool.mockRejectedValue(
        new MusterUnauthorizedError(
          "auth_required: server 'workspace-manager' requires authentication; sign in to it to use its tools.",
          'server_sign_in_required',
          'workspace-manager',
          'lab',
        ),
      );
      const client = new WorkspaceManagerClient(api, 'lab');

      await expect(client.authorizeWorkspace('portal')).rejects.toMatchObject({
        kind: 'unavailable',
        connect: [],
      });
    });

    it('still reads connect_required answered as data', async () => {
      const { api } = makeMusterApi({
        workspace: 'portal',
        outcome: 'connect_required',
        status: 'grant_required',
        apps: ['github'],
        reason: 'grant github in muster to use workspace portal',
        connect: [
          {
            provider: 'github',
            signIn:
              'Grant the github App in muster first: core_auth_login app=github',
          },
        ],
      });
      const client = new WorkspaceManagerClient(api, 'lab');

      const error = authorizationError(
        await client.authorizeWorkspace('portal'),
      );
      expect(error?.kind).toBe('not_connected');
      expect(error?.connect.map(c => c.provider)).toEqual(['github']);
    });
  });
});
