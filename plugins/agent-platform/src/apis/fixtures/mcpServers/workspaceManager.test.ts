import { createFixtureDataSet } from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  WORKSPACE_MANAGER_TOOLS,
  WorkspaceManagerError,
  authorizationError,
  type WorkspaceSource,
} from '../../../lib/workspaceManager';
import { WorkspaceManagerClient } from '../../WorkspaceManagerClient';
import { SETTLE_MS } from '../agentManagerFixtureState';
import { WorkspaceManagerFixtureState } from '../workspaceManagerFixtureState';
import { musterApiOf } from '../../../lib/__testUtils__/musterApiOf';
import { workspaceManagerFixtureServer } from './workspaceManager';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const INSTALLATION = 'meadow';

function setup() {
  const data = createFixtureDataSet({ now: NOW });
  let now = NOW;
  const state = new WorkspaceManagerFixtureState(data, () => now);
  const server = workspaceManagerFixtureServer(() => state);
  const client = new WorkspaceManagerClient(musterApiOf(server), INSTALLATION);
  const member = data.organizations.find(
    o => o.installation === INSTALLATION && o.state === 'ready',
  )!.name;
  const notMember = data.organizations.find(
    o => o.installation === INSTALLATION && o.role === 'none',
  )!.name;
  const [owner] = data.repositoryOwners.filter(o => o.provider === 'github');
  const workspaceIn = (wanted: string) =>
    data.workspaces.find(
      w => w.installation === INSTALLATION && w.state === wanted,
    )!.name;
  return {
    data,
    server,
    client,
    member,
    notMember,
    owner,
    workspaceIn,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function refusalOf(
  call: Promise<unknown>,
): Promise<WorkspaceManagerError> {
  const error = await call.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(WorkspaceManagerError);
  return error as WorkspaceManagerError;
}

describe('the fixture workspace-manager', () => {
  it('has a handler for every tool the client calls', () => {
    const { server } = setup();
    expect(Object.keys(server.tools).sort()).toEqual(
      Object.values(WORKSPACE_MANAGER_TOOLS).sort(),
    );
  });

  it("lists the workspaces of the person's organizations in every state", async () => {
    const { client, data, notMember } = setup();
    const list = await client.listWorkspaces();
    const expected = data.workspaces.filter(
      w => w.installation === INSTALLATION,
    );
    expect(list.workspaces.map(w => w.name).sort()).toEqual(
      expected.map(w => w.name).sort(),
    );
    expect(list.organizations).toEqual(
      [...list.organizations].sort((a, b) => a.localeCompare(b)),
    );
    expect(list.organizations).not.toContain(notMember);
    for (const workspace of expected) {
      expect(list.organizations).toContain(workspace.organization);
    }
    const byName = new Map(list.workspaces.map(w => [w.name, w] as const));
    const of = (state: string) =>
      byName.get(expected.find(w => w.state === state)!.name)!;
    expect(of('synced').lastSync?.result).toBe('Succeeded');
    expect(of('syncing').activeSync).toBeDefined();
    expect(of('failed').lastSync?.result).toBe('Failed');
    expect(of('pending').lastSync).toBeUndefined();
    expect(of('pending').volume?.pending).toBeDefined();
    expect(of('deleting').deleting).toBe(true);
    expect(of('synced').repositories).toBeGreaterThan(0);
  });

  it("lists one organization's workspaces, and refuses one the person is no member of", async () => {
    const { client, member, notMember } = setup();
    const list = await client.listWorkspaces(member);
    expect(list.workspaces.length).toBeGreaterThan(0);
    expect(list.workspaces.every(w => w.organization === member)).toBe(true);
    expect((await refusalOf(client.listWorkspaces(notMember))).kind).toBe(
      'not_member',
    );
  });

  it('reads a workspace with its mirrors, storage and Session directories', async () => {
    const { client, data } = setup();
    const withSessions = (
      await Promise.all(
        data.workspaces
          .filter(w => w.installation === INSTALLATION)
          .map(w => client.getWorkspace(w.name)),
      )
    ).filter(detail => detail.sessionDirectories.length > 0);
    expect(withSessions.length).toBeGreaterThan(0);
    const sessions = new Set(data.sessions.map(s => s.id));
    for (const detail of withSessions) {
      expect(detail.workspace.sessions).toBe(detail.sessionDirectories.length);
      expect(detail.mirrors).toHaveLength(detail.workspace.repositories);
      for (const directory of detail.sessionDirectories) {
        expect(directory.unknown || sessions.has(directory.session)).toBe(true);
      }
      expect(detail.storage.mirrorsBytes + detail.storage.sessionsBytes).toBe(
        detail.workspace.storedBytes,
      );
    }
    expect((await refusalOf(client.getWorkspace('nowhere'))).kind).toBe(
      'not_found',
    );
  });

  it('creates a workspace that syncs after the save, once', async () => {
    const { client, member, owner, advance } = setup();
    const sources: WorkspaceSource[] = [
      { provider: 'github', owner: owner.name, filters: { languages: ['Go'] } },
    ];
    const created = await client.createWorkspace({
      name: 'fresh-start',
      organization: member,
      sources,
    });
    expect(created.activeSync?.trigger).toBe('change');
    expect(created.lastSync).toBeUndefined();
    expect(
      (
        await refusalOf(
          client.createWorkspace({
            name: 'fresh-start',
            organization: member,
            sources,
          }),
        )
      ).kind,
    ).toBe('already_exists');

    advance(SETTLE_MS);
    const { workspace, mirrors } = await client.getWorkspace('fresh-start');
    expect(workspace.activeSync).toBeUndefined();
    expect(workspace.lastSync?.result).toBe('Succeeded');
    expect(workspace.repositories).toBeGreaterThan(0);
    expect(mirrors).toHaveLength(workspace.repositories);
  });

  it('refuses a create as workspace-manager does', async () => {
    const { client, member, notMember, owner } = setup();
    const sources: WorkspaceSource[] = [
      { provider: 'github', owner: owner.name, repositories: ['x'] },
    ];
    const kindOf = async (
      input: Parameters<typeof client.createWorkspace>[0],
    ) => (await refusalOf(client.createWorkspace(input))).kind;
    expect(
      await kindOf({ name: 'Not-A-Name', organization: member, sources }),
    ).toBe('invalid');
    expect(
      await kindOf({ name: 'elsewhere', organization: notMember, sources }),
    ).toBe('not_member');
    expect(
      await kindOf({ name: 'nothing', organization: member, sources: [] }),
    ).toBe('invalid');
    expect(
      await kindOf({
        name: 'unknown-provider',
        organization: member,
        sources: [
          { provider: 'nowhere', owner: owner.name, repositories: ['x'] },
        ],
      }),
    ).toBe('invalid');
    expect(
      await kindOf({
        name: 'no-selector',
        organization: member,
        sources: [{ provider: 'github', owner: owner.name }],
      }),
    ).toBe('invalid');
  });

  it('refuses an update of a workspace changed since it was read', async () => {
    const { client, workspaceIn, owner } = setup();
    const name = workspaceIn('synced');
    const { workspace } = await client.getWorkspace(name);
    const sources: WorkspaceSource[] = [
      {
        provider: 'github',
        owner: owner.name,
        filters: { topics: { names: ['cli'] } },
      },
    ];
    const updated = await client.updateWorkspace({
      name,
      sources,
      resourceVersion: workspace.resourceVersion,
    });
    expect(updated.resourceVersion).not.toBe(workspace.resourceVersion);
    expect(updated.sources).toEqual(sources);
    expect(updated.activeSync?.trigger).toBe('change');
    expect(
      (
        await refusalOf(
          client.updateWorkspace({
            name,
            sources,
            resourceVersion: workspace.resourceVersion,
          }),
        )
      ).kind,
    ).toBe('conflict');
  });

  it('serves a sync requested while one runs after it', async () => {
    const { client, workspaceIn, advance } = setup();
    const name = workspaceIn('syncing');
    const answer = await client.syncWorkspace(name);
    expect(answer.activeSync).toBeDefined();
    expect(
      (await client.getWorkspace(name)).workspace.syncRequest,
    ).toBeDefined();

    advance(SETTLE_MS);
    const running = (await client.getWorkspace(name)).workspace;
    expect(running.syncRequest).toBeUndefined();
    expect(running.activeSync?.trigger).toBe('request');

    advance(SETTLE_MS);
    const done = (await client.getWorkspace(name)).workspace;
    expect(done.activeSync).toBeUndefined();
    expect(done.lastSync).toMatchObject({
      result: 'Succeeded',
      trigger: 'request',
    });
  });

  it('turns a failed workspace synced by a requested sync', async () => {
    const { client, workspaceIn, advance } = setup();
    const name = workspaceIn('failed');
    const answer = await client.syncWorkspace(name);
    expect(answer.activeSync).toBeUndefined();
    advance(SETTLE_MS);
    expect((await client.getWorkspace(name)).workspace.lastSync?.result).toBe(
      'Succeeded',
    );
  });

  it('keeps a deleted workspace while Session directories remain, and lets one without go', async () => {
    const { client, member, owner, workspaceIn, advance } = setup();
    const deleting = workspaceIn('deleting');
    const answer = await client.deleteWorkspace(deleting);
    expect(answer.sessions.length).toBeGreaterThan(0);

    await client.createWorkspace({
      name: 'short-lived',
      organization: member,
      sources: [{ provider: 'github', owner: owner.name, repositories: ['x'] }],
    });
    expect(await client.deleteWorkspace('short-lived')).toEqual({
      workspace: 'short-lived',
      sessions: [],
    });
    expect((await client.getWorkspace('short-lived')).workspace.deleting).toBe(
      true,
    );
    advance(SETTLE_MS);
    const names = (await client.listWorkspaces()).workspaces.map(w => w.name);
    expect(names).not.toContain('short-lived');
    expect(names).toContain(deleting);
  });

  it('answers every outcome of the access check before a Session', async () => {
    const { client, data } = setup();
    const answers = await Promise.all(
      data.workspaces
        .filter(w => w.installation === INSTALLATION)
        .map(w => client.authorizeWorkspace(w.name)),
    );
    expect(new Set(answers.map(a => a.outcome))).toEqual(
      new Set(['granted', 'refused', 'connect_required']),
    );
    const withOutcome = (outcome: string) =>
      answers.filter(answer => answer.outcome === outcome);
    for (const answer of withOutcome('granted')) {
      expect(answer.grant).toBeTruthy();
      expect(answer.repositories?.length).toBeGreaterThan(0);
      expect(authorizationError(answer)).toBeUndefined();
    }
    for (const answer of withOutcome('connect_required')) {
      const error = authorizationError(answer);
      expect(error?.kind).toBe('not_connected');
      expect(error?.connect[0].signIn).toMatch(/core_auth_login app=/);
    }
    for (const answer of withOutcome('refused')) {
      expect(authorizationError(answer)?.kind).toBe('refused');
    }
    expect(
      answers.some(a => a.outcome === 'refused' && a.unreadable?.length),
    ).toBe(true);
  });

  it("lists providers, owners and pages of an owner's repositories", async () => {
    const { client, data, member, owner } = setup();
    const providers = await client.listProviders();
    expect(providers.map(p => p.connected)).toEqual([true, false]);
    expect(providers[1].signIn).toMatch(/core_auth_login app=/);

    const owners = await client.listOwners({
      organization: member,
      provider: 'github',
    });
    expect(owners.map(o => o.name)).toContain(owner.name);
    expect(
      await client.listOwners({
        organization: member,
        provider: providers[1].name,
      }),
    ).toEqual([]);

    const all = data.repositories.filter(
      r => r.provider === 'github' && r.owner === owner.name,
    );
    const page = await client.listRepositories({
      organization: member,
      provider: 'github',
      owner: owner.name,
      pageSize: 5,
      page: 2,
    });
    expect(page).toMatchObject({
      total: all.length,
      ownerTotal: all.length,
      page: 2,
      pageSize: 5,
    });
    expect(page.repositories.map(r => r.name)).toEqual(
      all.slice(5, 10).map(r => r.name),
    );
    const counted = page.languageCounts!.reduce((sum, c) => sum + c.count, 0);
    expect(counted).toBe(all.filter(r => r.language).length);

    const go = await client.listRepositories({
      organization: member,
      provider: 'github',
      owner: owner.name,
      languages: ['Go'],
      archived: false,
    });
    expect(go.repositories.every(r => r.language === 'Go' && !r.archived)).toBe(
      true,
    );
    // From the manager's own listing: the person's grant does not matter.
    const ungrantedOwner = data.repositoryOwners.find(
      o => o.provider === providers[1].name,
    )!;
    expect(
      (
        await client.listRepositories({
          organization: member,
          provider: providers[1].name,
          owner: ungrantedOwner.name,
        })
      ).total,
    ).toBeGreaterThan(0);
  });

  it('serves an edit made while a sync runs after it, as a change', async () => {
    const { client, workspaceIn, owner, advance } = setup();
    const name = workspaceIn('syncing');
    const sources: WorkspaceSource[] = [
      { provider: 'github', owner: owner.name, repositories: ['x'] },
    ];
    await client.updateWorkspace({ name, sources });
    advance(SETTLE_MS);
    expect(
      (await client.getWorkspace(name)).workspace.activeSync?.trigger,
    ).toBe('change');
    advance(SETTLE_MS);
    const { workspace } = await client.getWorkspace(name);
    expect(workspace.activeSync).toBeUndefined();
    expect(workspace.syncRequest).toBeUndefined();
    expect(workspace.lastSync?.trigger).toBe('change');
  });

  it('starts no sync on a workspace being deleted', async () => {
    const { client, workspaceIn, owner, advance } = setup();
    const name = workspaceIn('deleting');
    const before = (await client.getWorkspace(name)).workspace.lastSync;
    const answer = await client.syncWorkspace(name);
    expect(answer).toMatchObject({ workspace: name, deleting: true });
    await client.updateWorkspace({
      name,
      sources: [{ provider: 'github', owner: owner.name, repositories: ['x'] }],
    });
    advance(2 * SETTLE_MS);
    const { workspace } = await client.getWorkspace(name);
    expect(workspace.activeSync).toBeUndefined();
    expect(workspace.lastSync).toEqual(before);
  });

  it('mirrors what a synced workspace selects, whatever the person may read', async () => {
    const { client, data } = setup();
    const { workspaces } = await client.listWorkspaces();
    const synced = workspaces.filter(w => w.lastSync?.result === 'Succeeded');
    expect(synced.every(w => w.repositories > 0)).toBe(true);
    // One workspace of the installation is on the provider the person has
    // not granted: their sign-in is due when they start a Session on it.
    const onUngranted = data.workspaces.filter(
      w =>
        w.installation === INSTALLATION &&
        w.sources.some(s => s.provider === 'code-example'),
    );
    expect(onUngranted).toHaveLength(1);
  });

  it('lists only the ready organizations the person is a member of', async () => {
    const { client, data } = setup();
    const { organizations } = await client.listWorkspaces();
    expect(organizations).toEqual(
      data.organizations
        .filter(
          o =>
            o.installation === INSTALLATION &&
            o.state === 'ready' &&
            o.role !== 'none',
        )
        .map(o => o.name)
        .sort((a, b) => a.localeCompare(b)),
    );
  });

  it('says what a failed sync fetched, even where it selects nothing', async () => {
    const data = createFixtureDataSet({ now: NOW, repositories: { count: 0 } });
    const state = new WorkspaceManagerFixtureState(data, () => NOW);
    const failed = data.workspaces.find(
      w => w.installation === INSTALLATION && w.state === 'failed',
    )!;
    expect(
      state.getWorkspace(INSTALLATION, failed.name).workspace.lastSync?.message,
    ).toBe(
      `fetching ${failed.sources[0].owner}: the provider answered 502 Bad Gateway`,
    );
  });

  it('names no organization "undefined" when a call leaves it out', async () => {
    const { client, owner } = setup();
    const error = await refusalOf(
      client.listRepositories({
        provider: 'github',
        owner: owner.name,
      } as Parameters<typeof client.listRepositories>[0]),
    );
    expect(error.kind).toBe('not_member');
    expect(error.message).toContain('Organization ""');
  });

  it('previews a workspace and a draft', async () => {
    const { client, workspaceIn, member, owner } = setup();
    const name = workspaceIn('synced');
    const preview = await client.previewWorkspace({ workspace: name });
    expect(preview.workspace).toBe(name);
    expect(preview.total).toBe(preview.matching);
    expect(preview.repositories.every(r => r.why.length > 0)).toBe(true);

    const draft = await client.previewWorkspace({
      organization: member,
      sources: [
        {
          provider: 'github',
          owner: owner.name,
          filters: { topics: { names: ['api'] } },
          includeArchived: true,
          includeForks: true,
        },
      ],
      search: 'zzz-nothing',
    });
    expect(draft.total).toBeGreaterThan(0);
    expect(draft.matching).toBe(0);
    expect(draft.skippedArchived + draft.skippedForks).toBe(0);
  });

  it('answers copies, which a page may change without changing the next answer', async () => {
    const { client } = setup();
    const first = await client.listWorkspaces();
    first.workspaces[0].sources.length = 0;
    first.organizations.length = 0;
    const second = await client.listWorkspaces();
    expect(second.workspaces[0].sources.length).toBeGreaterThan(0);
    expect(second.organizations.length).toBeGreaterThan(0);
  });
});
