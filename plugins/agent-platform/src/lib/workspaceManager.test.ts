import {
  WorkspaceManagerError,
  authorizationError,
  classifyWorkspaceManagerError,
  providerDisplayName,
  workspaceManagerToolName,
  type WorkspaceAuthorization,
} from './workspaceManager';

/**
 * Refusals as workspace-manager 0.4.1 words them (`toolError` and the
 * Organization check in internal/api and internal/workspace), as muster's
 * proxy throws them: the tool's error text is the message.
 */
const REFUSALS = {
  // The Organization check from the forwarded groups, before workspaces live
  // in the Organization's namespace.
  notMember:
    'list workspaces: permission denied: forbidden: bob@example.com is not a member of Organization "acme"',
  notMemberOnAuthorize:
    'authorize workspace: workspace "platform": forbidden: bob@example.com is not a member of Organization "acme"',
  // The Kubernetes permission refusal, once the check is RBAC on the
  // person's identity in the Organization's namespace.
  kubernetesForbidden:
    'get workspace: permission denied: workspaces.workspace-manager.giantswarm.io "platform" is forbidden: User "bob@example.com" cannot get resource "workspaces" in API group "workspace-manager.giantswarm.io" in the namespace "org-acme"',
  kubernetesForbiddenUnwrapped:
    'get workspace: workspace "platform": workspaces.workspace-manager.giantswarm.io "platform" is forbidden: User "bob@example.com" cannot get resource "workspaces" in API group "workspace-manager.giantswarm.io" in the namespace "org-acme"',
  invalid:
    'create workspace: invalid workspace: invalid workspace "platform": sources[0]: unknown provider instance "gitlab" (configured: github)',
  invalidSizing:
    'update workspace: invalid workspace: invalid workspace: sizing.minimum "lots": quantities must match the regular expression',
  unknownProvider: 'connect provider: unknown provider "gitlab"',
  missingArgument: 'required argument "workspace" not found',
  missingOwner: 'list repositories: provider and owner are required',
  notFound:
    'get workspace: not found: workspaces.workspace-manager.giantswarm.io "nope" not found',
  alreadyExists:
    'create workspace: already exists: workspaces.workspace-manager.giantswarm.io "platform" already exists',
  conflict:
    'update workspace: the workspace changed since it was read; read it again and retry: Operation cannot be fulfilled',
  musterToolMissing: 'tool not found: x_workspace-manager_list_workspaces',
  musterAuthRequired: 'server workspace-manager requires authentication',
  other: 'list workspaces: list workspaces: the server is currently unable',
};

describe('workspaceManagerToolName', () => {
  it('names a tool as muster exposes it', () => {
    expect(workspaceManagerToolName('list_workspaces')).toBe(
      'x_workspace-manager_list_workspaces',
    );
  });
});

describe('classifyWorkspaceManagerError', () => {
  it.each([
    ['notMember', 'not_member'],
    ['notMemberOnAuthorize', 'not_member'],
    ['kubernetesForbidden', 'not_member'],
    ['kubernetesForbiddenUnwrapped', 'not_member'],
    ['invalid', 'invalid'],
    ['invalidSizing', 'invalid'],
    ['unknownProvider', 'invalid'],
    ['missingArgument', 'invalid'],
    ['missingOwner', 'invalid'],
    ['notFound', 'not_found'],
    ['alreadyExists', 'already_exists'],
    ['conflict', 'conflict'],
    ['musterToolMissing', 'unavailable'],
    ['musterAuthRequired', 'unavailable'],
    ['other', 'failed'],
  ] as const)('classifies %s as %s, keeping the message', (refusal, kind) => {
    const error = classifyWorkspaceManagerError(new Error(REFUSALS[refusal]));
    expect(error).toBeInstanceOf(WorkspaceManagerError);
    expect(error.kind).toBe(kind);
    expect(error.message).toBe(REFUSALS[refusal]);
  });

  it('passes a classified error on unchanged', () => {
    const error = new WorkspaceManagerError('refused', 'no', ['acme/api']);
    expect(classifyWorkspaceManagerError(error)).toBe(error);
  });

  it('classifies what is not an Error by its text', () => {
    expect(classifyWorkspaceManagerError(REFUSALS.notFound).kind).toBe(
      'not_found',
    );
  });
});

describe('authorizationError', () => {
  it('is nothing for a grant', () => {
    expect(
      authorizationError({
        workspace: 'platform',
        outcome: 'granted',
        grant: 'eyJ…',
      }),
    ).toBeUndefined();
  });

  it('names the repositories the person cannot read', () => {
    const refused: WorkspaceAuthorization = {
      workspace: 'platform',
      outcome: 'refused',
      reason:
        'you cannot read 2 repositories of workspace platform: acme/billing, acme/secrets',
      repositories: ['acme/api', 'acme/billing', 'acme/secrets'],
      unreadable: ['acme/billing', 'acme/secrets'],
    };
    const error = authorizationError(refused)!;
    expect(error.kind).toBe('refused');
    expect(error.repositories).toEqual(['acme/billing', 'acme/secrets']);
    expect(error.message).toBe(refused.reason);
  });

  it('refuses without repositories where the workspace cannot be started on yet', () => {
    const error = authorizationError({
      workspace: 'platform',
      outcome: 'refused',
      reason:
        'workspace platform has not synced yet: its repositories are not on its volume',
    })!;
    expect(error.kind).toBe('refused');
    expect(error.repositories).toEqual([]);
    expect(error.message).toMatch(/has not synced yet/);
  });

  it('names the providers to connect with their links', () => {
    const error = authorizationError({
      workspace: 'platform',
      outcome: 'connect_required',
      reason:
        'connect github to use workspace platform: the Session works as you there',
      connect: [
        {
          provider: 'github',
          url: 'https://workspaces.example.com/connect/github',
        },
      ],
    })!;
    expect(error.kind).toBe('not_connected');
    expect(error.connect).toEqual([
      {
        provider: 'github',
        url: 'https://workspaces.example.com/connect/github',
      },
    ]);
  });
});

describe('providerDisplayName', () => {
  it('spells an instance named after its kind the way the provider does', () => {
    expect(providerDisplayName({ name: 'github', kind: 'github' })).toBe(
      'GitHub',
    );
    expect(providerDisplayName({ name: 'gitlab', kind: 'gitlab' })).toBe(
      'GitLab',
    );
  });

  it('keeps an instance name of its own beside the kind', () => {
    expect(providerDisplayName({ name: 'gitlab-lab', kind: 'gitlab' })).toBe(
      'gitlab-lab (GitLab)',
    );
  });

  it('falls back to the kind as given for an unknown one', () => {
    expect(providerDisplayName({ name: 'forge', kind: 'forge' })).toBe('forge');
  });
});
