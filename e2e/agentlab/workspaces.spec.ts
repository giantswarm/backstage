import { lab } from './lab';
import {
  deleteWorkspace,
  expect,
  NON_MEMBER,
  OWNER,
  PUBLIC_REPOSITORIES,
  test,
  WORKSPACE_PREFIX,
  WorkspaceToolError,
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

    const synced = await workspaceLab.create(
      'smoke',
      [workspaceLab.publicSource],
      PUBLIC_REPOSITORIES,
    );
    testInfo.annotations.push({
      type: 'first sync',
      description: `${synced.firstSyncSeconds} s for ${synced.repositories.join(', ')}`,
    });
    const listed = await admin.listWorkspaces(lab.workspaces.organization);
    expect(
      listed.find(workspace => workspace.name === synced.name),
      'the Organization lists the workspace with both repositories',
    ).toMatchObject({
      organization: lab.workspaces.organization,
      repositories: PUBLIC_REPOSITORIES.length,
    });

    await deleteWorkspace(admin, synced.name);
    const remaining = await admin.listWorkspaces(lab.workspaces.organization);
    expect(remaining.map(workspace => workspace.name)).not.toContain(
      synced.name,
    );
  });

  test('a rerun removes what an aborted run left before it creates', async ({
    workspaceLab,
  }) => {
    test.skip(!!workspaceLab.unavailable, workspaceLab.unavailable);
    test.setTimeout(10 * 60_000);
    const admin = await workspaceLab.tools(lab.users.admin);
    // As an aborted run leaves it: a workspace of a run that started four
    // hours ago, never deleted.
    const abortedRun = (Date.now() - 4 * 60 * 60_000).toString(36);
    const aborted = `${WORKSPACE_PREFIX}${abortedRun}-0-public`;
    await admin.call('create_workspace', {
      name: aborted,
      organization: lab.workspaces.organization,
      sources: [
        {
          provider: workspaceLab.provider,
          owner: OWNER,
          repositories: ['platform-api'],
        },
      ],
    });
    try {
      // The fixtures' own creation sweeps before it creates.
      const synced = await workspaceLab.create(
        'rerun',
        [workspaceLab.publicSource],
        PUBLIC_REPOSITORIES,
      );
      expect(
        synced.sweep.removed,
        'the creation removed the leftover',
      ).toContain(aborted);
      const names = (
        await admin.listWorkspaces(lab.workspaces.organization)
      ).map(workspace => workspace.name);
      expect(names, 'no workspace of the aborted run is left').not.toContain(
        aborted,
      );
      expect(names, 'the rerun has its own').toContain(synced.name);
      await deleteWorkspace(admin, synced.name);
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

    // A member who reads every repository is granted on the same one.
    const granted = await workspaceLab.tools(refusalWorkspace.granted);
    const grant = await granted.authorizeWorkspace(refusalWorkspace.name);
    expect(grant, JSON.stringify(grant)).toMatchObject({
      workspace: refusalWorkspace.name,
      outcome: 'granted',
    });
  });
});
