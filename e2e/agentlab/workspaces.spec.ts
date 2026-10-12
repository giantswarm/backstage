import { lab } from './lab';
import {
  createSyncedWorkspace,
  deleteWorkspace,
  expect,
  NON_MEMBER,
  removeLeftovers,
  test,
  WORKSPACE_PREFIX,
  WorkspaceToolError,
  workspaceName,
} from './workspaces.fixture';

/**
 * The workspace fixtures against the lab's workspace-manager, through the
 * portal's muster route as the lab's people: what the Workspaces pages and the
 * Session start build on. See `workspaces.fixture.ts`.
 */
test.describe('workspaces', () => {
  test('smoke: a workspace reaches its first successful sync and is deleted', async ({
    workspaceLab,
  }, testInfo) => {
    test.skip(!!workspaceLab.unavailable, workspaceLab.unavailable);
    test.setTimeout(10 * 60_000);
    const admin = await workspaceLab.tools(lab.users.admin);
    await removeLeftovers(admin);

    const name = workspaceName('smoke', testInfo.workerIndex);
    try {
      const synced = await createSyncedWorkspace(
        admin,
        name,
        [
          {
            provider: lab.workspaces.provider,
            owner: 'agentlab-org',
            repositories: ['platform-api'],
            filters: { languages: ['Go'], topics: { names: ['monorepo'] } },
          },
        ],
        ['agentlab-org/monorepo', 'agentlab-org/platform-api'],
      );
      testInfo.annotations.push({
        type: 'first sync',
        description: `${synced.firstSyncSeconds} s for ${synced.repositories.join(', ')}`,
      });
      const listed = await admin.listWorkspaces(lab.workspaces.organization);
      expect(
        listed.find(workspace => workspace.name === name),
        'the Organization lists the workspace with both repositories',
      ).toMatchObject({
        organization: lab.workspaces.organization,
        repositories: 2,
      });
    } finally {
      await deleteWorkspace(admin, name);
    }
    const remaining = await admin.listWorkspaces(lab.workspaces.organization);
    expect(remaining.map(workspace => workspace.name)).not.toContain(name);
  });

  test('a rerun removes what an aborted run left before it creates', async ({
    workspaceLab,
  }) => {
    test.skip(!!workspaceLab.unavailable, workspaceLab.unavailable);
    test.setTimeout(5 * 60_000);
    const admin = await workspaceLab.tools(lab.users.admin);
    // As an aborted run leaves it: a workspace of another run id, never deleted.
    const aborted = `${WORKSPACE_PREFIX}aborted${Date.now().toString(36)}-0-public`;
    await admin.call('create_workspace', {
      name: aborted,
      organization: lab.workspaces.organization,
      sources: [
        {
          provider: lab.workspaces.provider,
          owner: 'agentlab-org',
          repositories: ['platform-api'],
        },
      ],
    });
    try {
      expect(await removeLeftovers(admin)).toContain(aborted);
      const names = (
        await admin.listWorkspaces(lab.workspaces.organization)
      ).map(workspace => workspace.name);
      expect(names, 'no workspace of another run is left').not.toContain(
        aborted,
      );
    } finally {
      await deleteWorkspace(admin, aborted);
    }
  });

  test('a person outside the Organization is refused on its workspace', async ({
    labWorkspace,
    workspaceLab,
  }) => {
    const outsider = await workspaceLab.tools(NON_MEMBER);
    const admin = await workspaceLab.tools(lab.users.admin);

    // The member reads it.
    const detail = await admin.getWorkspace(labWorkspace.name);
    expect(detail.workspace.organization).toBe(lab.workspaces.organization);

    // The outsider is refused, by the manager's membership check.
    for (const [what, attempt] of [
      ['get_workspace', () => outsider.getWorkspace(labWorkspace.name)],
      [
        'list_workspaces for the Organization',
        () => outsider.listWorkspaces(lab.workspaces.organization),
      ],
      [
        'authorize_workspace',
        () => outsider.authorizeWorkspace(labWorkspace.name),
      ],
    ] as const) {
      const error = await attempt().then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(
        error,
        `${what} as ${NON_MEMBER.email} is refused as not a member`,
      ).toBeInstanceOf(WorkspaceToolError);
      expect((error as WorkspaceToolError).notMember, String(error)).toBe(true);
    }
    // Nobody outside sees it in their own list either.
    const own = await outsider.listWorkspaces();
    expect(own.map(workspace => workspace.name)).not.toContain(
      labWorkspace.name,
    );
  });

  test('a member who cannot read a repository is refused at Session start, naming it', async ({
    refusalWorkspace,
    workspaceLab,
  }) => {
    const refused = await workspaceLab.tools(refusalWorkspace.refused);
    const authorization = await refused.authorizeWorkspace(
      refusalWorkspace.name,
    );
    expect(authorization, JSON.stringify(authorization)).toMatchObject({
      workspace: refusalWorkspace.name,
      outcome: 'refused',
    });
    expect(authorization.unreadable).toEqual(refusalWorkspace.unreadable);

    // The admin, who reads every repository, is granted on the same one.
    const admin = await workspaceLab.tools(lab.users.admin);
    const granted = await admin.authorizeWorkspace(refusalWorkspace.name);
    expect(
      granted.outcome,
      `the admin's start is not refused: ${JSON.stringify(granted)}`,
    ).not.toBe('refused');
  });
});
