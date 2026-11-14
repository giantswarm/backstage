import { FIXTURE_INSTALLATION, FIXTURE_INSTALLATIONS } from '../fixtureMode';
import {
  AGENT_STATES,
  CONNECTOR_STATES,
  EXECUTION_STATES,
  INSTALLATION_STATES,
  ORGANIZATION_STATES,
  SESSION_STATES,
  SESSION_TURNS,
  DAY,
  WORKFLOW_STATES,
} from './builders';
import { baseDataSet, createFixtureDataSet, inInstallation } from './dataSet';
import {
  FIXTURE_PROVIDERS,
  SKILL_REPOSITORY_STATES,
  TOOLCHAIN_SOURCE_STATES,
  WORKSPACE_STATES,
} from './managerBuilders';
import { MAX_NAME_LENGTH } from './names';

const now = Date.parse('2026-11-14T12:00:00Z');
const kubernetesName = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

function namespacesOf(organizations: { namespace?: string }[]): string[] {
  return organizations.flatMap(o => (o.namespace ? [o.namespace] : []));
}

function statesOf(items: { state: string }[]): Set<string> {
  return new Set(items.map(item => item.state));
}

describe('createFixtureDataSet', () => {
  it('builds the same data set from the same seed and time', () => {
    expect(createFixtureDataSet({ now })).toEqual(
      createFixtureDataSet({ now }),
    );
    expect(createFixtureDataSet({ now, seed: 2 })).not.toEqual(
      createFixtureDataSet({ now }),
    );
  });

  it('has the served installations, two reachable and one not', () => {
    const { installations } = createFixtureDataSet({ now });
    expect(installations).toEqual([
      { name: FIXTURE_INSTALLATION, state: 'reachable' },
      { name: FIXTURE_INSTALLATIONS[1], state: 'reachable' },
      { name: FIXTURE_INSTALLATIONS[2], state: 'unreachable' },
    ]);
  });

  it('has every state of every list in the base data set', () => {
    const data = createFixtureDataSet({ now });
    expect(statesOf(data.installations)).toEqual(
      new Set(INSTALLATION_STATES.filter(state => state !== 'unknown')),
    );
    expect(statesOf(data.organizations)).toEqual(new Set(ORGANIZATION_STATES));
    expect(statesOf(data.agents)).toEqual(new Set(AGENT_STATES));
    expect(statesOf(data.connectors)).toEqual(new Set(CONNECTOR_STATES));
    expect(statesOf(data.sessions)).toEqual(new Set(SESSION_STATES));
    expect(statesOf(data.workflows)).toEqual(new Set(WORKFLOW_STATES));
    expect(statesOf(data.executions)).toEqual(new Set(EXECUTION_STATES));
    expect(new Set(data.sessions.map(s => s.turn))).toEqual(
      new Set([...SESSION_TURNS, 'none']),
    );
    expect(statesOf(data.workspaces)).toEqual(new Set(WORKSPACE_STATES));
    expect(statesOf(data.toolchainSources)).toEqual(
      new Set(TOOLCHAIN_SOURCE_STATES),
    );
    expect(statesOf(data.skillRepositories)).toEqual(
      new Set(SKILL_REPOSITORY_STATES),
    );
  });

  it.each(FIXTURE_INSTALLATIONS)('has every state in %s', installation => {
    const data = createFixtureDataSet({ now });
    const served = <T extends { installation: string }>(items: T[]) =>
      inInstallation(items, installation);
    expect(statesOf(served(data.organizations))).toEqual(
      new Set(ORGANIZATION_STATES),
    );
    expect(
      new Set(
        served(data.organizations)
          .filter(o => o.state === 'ready')
          .map(o => o.role),
      ),
    ).toEqual(new Set(['admin', 'editor', 'user']));
    expect(statesOf(served(data.agents))).toEqual(new Set(AGENT_STATES));
    expect(statesOf(served(data.connectors))).toEqual(
      new Set(CONNECTOR_STATES),
    );
    expect(statesOf(served(data.sessions))).toEqual(new Set(SESSION_STATES));
    expect(statesOf(served(data.executions))).toEqual(
      new Set(EXECUTION_STATES),
    );
  });

  it('gives the person each role in the ready organizations, and none in a pending one', () => {
    const data = createFixtureDataSet({ now });
    const rolesIn = (state: string) =>
      new Set(
        data.organizations.filter(o => o.state === state).map(o => o.role),
      );
    expect(rolesIn('ready')).toEqual(new Set(['admin', 'editor', 'user']));
    expect(rolesIn('pending')).toEqual(new Set(['none']));
    for (const state of ['orphaned', 'pendingErase', 'deleting']) {
      expect(rolesIn(state)).toEqual(new Set(['admin']));
    }
  });

  it('has one agent whose release failed, which is pending', () => {
    const data = createFixtureDataSet({ now });
    const failed = data.agents.filter(agent => agent.release === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      installation: FIXTURE_INSTALLATION,
      state: 'pending',
    });
  });

  it('gives every served installation a session whose newest turn is in each state, recently', () => {
    const data = createFixtureDataSet({ now });
    for (const installation of FIXTURE_INSTALLATIONS) {
      const turns = inInstallation(data.sessions, installation).filter(
        session => session.turn !== 'completed' && session.turn !== 'none',
      );
      expect(new Set(turns.map(session => session.turn))).toEqual(
        new Set(SESSION_TURNS.filter(turn => turn !== 'completed')),
      );
      for (const session of turns) {
        expect(now - Date.parse(session.updatedAt)).toBeLessThanOrEqual(
          2 * DAY,
        );
        expect(session.state).toBe(
          session.turn === 'approval' || session.turn === 'askUser'
            ? 'suspended'
            : 'ready',
        );
      }
      expect(turns.find(session => session.turn === 'working')?.updatedAt).toBe(
        new Date(now).toISOString(),
      );
    }
  });

  it('gives sessions only to ready agents of ready organizations', () => {
    const data = createFixtureDataSet({ now });
    const runnable = new Set(
      data.agents
        .filter(
          agent =>
            agent.state === 'ready' &&
            data.organizations.some(
              o => o.namespace === agent.namespace && o.state === 'ready',
            ),
        )
        .map(agent => `${agent.namespace}/${agent.name}`),
    );
    expect(runnable.size).toBeGreaterThan(0);
    expect(
      new Set(data.sessions.map(s => `${s.agent.namespace}/${s.agent.name}`)),
    ).toEqual(runnable);
  });

  it('relates the lists to each other', () => {
    const data = createFixtureDataSet({ now });
    const installations = new Set(data.installations.map(i => i.name));
    for (const list of [
      data.organizations,
      data.agents,
      data.connectors,
      data.sessions,
      data.workflows,
      data.executions,
    ]) {
      for (const item of list) {
        expect(installations).toContain(item.installation);
      }
    }
    const namespaces = new Map(
      data.organizations.map(o => [o.namespace, o] as const),
    );
    for (const agent of data.agents) {
      expect(namespaces.get(agent.namespace)).toMatchObject({
        name: agent.organization,
        installation: agent.installation,
      });
    }
    const agents = new Set(data.agents.map(a => `${a.namespace}/${a.name}`));
    for (const session of data.sessions) {
      expect(agents).toContain(
        `${session.agent.namespace}/${session.agent.name}`,
      );
    }
    const workflows = new Set(data.workflows.map(w => w.name));
    for (const execution of data.executions) {
      expect(workflows).toContain(execution.workflow);
    }
  });

  it('gives a pending organization no namespace and no agents', () => {
    const data = createFixtureDataSet({ now });
    const pending = data.organizations.filter(o => o.state === 'pending');
    expect(pending.length).toBeGreaterThan(0);
    for (const organization of pending) {
      expect(organization.namespace).toBeUndefined();
      expect(
        data.agents.filter(a => a.organization === organization.name),
      ).toEqual([]);
    }
  });

  it('makes unique Kubernetes names', () => {
    const data = createFixtureDataSet({ now });
    for (const list of [
      data.installations,
      data.organizations,
      data.agents,
      data.connectors,
      data.workflows,
    ]) {
      const names = list.map(item => item.name);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        expect(name).toMatch(kubernetesName);
      }
    }
    for (const namespace of namespacesOf(data.organizations)) {
      expect(namespace).toMatch(kubernetesName);
      expect(namespace.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    }
    const ids = data.sessions.map(session => session.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('dates everything before now, and completions after starts', () => {
    const data = createFixtureDataSet({ now });
    for (const session of data.sessions) {
      expect(Date.parse(session.createdAt)).toBeLessThanOrEqual(now);
      expect(Date.parse(session.updatedAt)).toBeGreaterThanOrEqual(
        Date.parse(session.createdAt),
      );
      expect(Date.parse(session.updatedAt)).toBeLessThanOrEqual(now);
    }
    for (const execution of data.executions) {
      const started = Date.parse(execution.startedAt);
      expect(started).toBeLessThanOrEqual(now);
      const completed = execution.completedAt
        ? Date.parse(execution.completedAt)
        : undefined;
      expect(completed === undefined).toBe(execution.state === 'inprogress');
      // A run in progress has run from its start until now.
      expect(completed ?? now).toBe(started + execution.durationMs);
      expect(execution.error !== undefined).toBe(execution.state === 'failed');
    }
  });
});

describe("the managers' lists", () => {
  const data = createFixtureDataSet({ now });

  it.each(FIXTURE_INSTALLATIONS)(
    'has workspaces, toolchains and skills in %s',
    installation => {
      expect(statesOf(inInstallation(data.workspaces, installation))).toEqual(
        new Set(WORKSPACE_STATES),
      );
      expect(
        inInstallation(data.toolchains, installation).length,
      ).toBeGreaterThan(0);
      expect(
        statesOf(inInstallation(data.skillRepositories, installation)),
      ).toEqual(new Set(SKILL_REPOSITORY_STATES));
    },
  );

  it('puts workspaces in the ready organizations the person is a member of', () => {
    const organizations = new Map(
      data.organizations.map(o => [`${o.installation}/${o.name}`, o] as const),
    );
    for (const workspace of data.workspaces) {
      expect(
        organizations.get(
          `${workspace.installation}/${workspace.organization}`,
        ),
      ).toMatchObject({
        state: 'ready',
        role: expect.not.stringMatching('none'),
      });
    }
  });

  it('selects repositories that exist, on every provider instance', () => {
    const owners = new Set(
      data.repositoryOwners.map(o => `${o.provider}/${o.name}`),
    );
    const repositories = new Set(
      data.repositories.map(r => `${r.provider}/${r.owner}/${r.name}`),
    );
    const providers = new Set<string>();
    for (const workspace of data.workspaces) {
      expect(workspace.sources.length).toBeGreaterThan(0);
      for (const source of workspace.sources) {
        providers.add(source.provider);
        expect(owners).toContain(`${source.provider}/${source.owner}`);
        for (const name of source.repositories ?? []) {
          expect(repositories).toContain(
            `${source.provider}/${source.owner}/${name}`,
          );
        }
      }
    }
    expect(providers).toEqual(new Set(FIXTURE_PROVIDERS.map(p => p.name)));
    expect(data.repositories.some(r => !r.readable)).toBe(true);
  });

  it("dates a workspace's last sync after its creation, and none before the first", () => {
    for (const workspace of data.workspaces) {
      expect(Date.parse(workspace.createdAt)).toBeLessThanOrEqual(now);
      expect(workspace.lastSyncAt === undefined).toBe(
        workspace.state === 'pending',
      );
    }
  });

  it('publishes toolchains from the readable offered sources only, one name from two', () => {
    for (const installation of FIXTURE_INSTALLATIONS) {
      const sources = inInstallation(data.toolchainSources, installation);
      const readable = new Set(
        sources.filter(s => s.state === 'offered').map(s => s.name),
      );
      const toolchains = inInstallation(data.toolchains, installation);
      expect(new Set(toolchains.map(t => t.source))).toEqual(readable);
      const names = toolchains.map(t => t.name);
      expect(names.length - new Set(names).size).toBe(1);
      for (const toolchain of toolchains) {
        expect(toolchain.versions.length).toBeGreaterThan(0);
        for (const version of toolchain.versions) {
          expect(version).toMatch(/^v\d+\.\d+\.\d+$/);
        }
        expect(new Set(toolchain.versions).size).toBe(
          toolchain.versions.length,
        );
      }
    }
  });

  it("puts each installation's configured toolchain sources first, whatever the count", () => {
    const three = createFixtureDataSet({ now, toolchainSources: { count: 3 } });
    for (const installation of FIXTURE_INSTALLATIONS) {
      expect(
        inInstallation(three.toolchainSources, installation).map(
          s => s.addedBy === undefined,
        ),
      ).toEqual([true, true, false]);
    }
  });

  it('lists no skills of a repository that failed or is hidden', () => {
    for (const repository of data.skillRepositories) {
      expect(repository.skills.length === 0).toBe(
        repository.state === 'failed' || repository.state === 'hidden',
      );
      const skills = new Set(repository.skills.map(s => s.name));
      for (const plugin of repository.plugins) {
        for (const skill of plugin.skills) {
          expect(skills).toContain(skill);
        }
      }
    }
  });

  it('makes count items per parent', () => {
    const many = createFixtureDataSet({
      now,
      repositories: { count: 40 },
      workspaces: { count: 5 },
      toolchains: { count: 9 },
      skills: { count: 20, nameLength: 40 },
    });
    expect(many.repositories).toHaveLength(many.repositoryOwners.length * 40);
    const memberOrganizations = many.organizations.filter(
      o => o.state === 'ready' && o.role !== 'none',
    );
    expect(many.workspaces).toHaveLength(memberOrganizations.length * 5);
    for (const repository of many.skillRepositories) {
      for (const skill of repository.skills) {
        expect(skill.name.length).toBeGreaterThanOrEqual(40);
      }
    }
  });
});

describe('builder settings', () => {
  it('makes count items per parent', () => {
    const data = createFixtureDataSet({
      now,
      installations: { count: 2 },
      organizations: { count: 3, states: ['ready'] },
      agents: { count: 5, states: ['ready'] },
      connectors: { count: 7 },
      sessions: { count: 4 },
      turnSessions: { count: 2 },
      workflows: { count: 1 },
      executions: { count: 6 },
    });
    expect(data.installations).toHaveLength(2);
    expect(data.organizations).toHaveLength(2 * 3);
    expect(data.agents).toHaveLength(2 * 3 * 5);
    expect(data.connectors).toHaveLength(2 * 7);
    expect(data.sessions).toHaveLength(2 * 3 * 5 * 4 + 2 * 2);
    expect(data.workflows).toHaveLength(2);
    expect(data.executions).toHaveLength(2 * 6);
  });

  it('makes many items with unique names', () => {
    const { connectors } = createFixtureDataSet({
      now,
      installations: { count: 1 },
      connectors: { count: 500 },
    });
    expect(new Set(connectors.map(c => c.name)).size).toBe(500);
  });

  it('makes names at least nameLength long, up to the Kubernetes limit', () => {
    const data = createFixtureDataSet({
      now,
      installations: { count: 4, nameLength: 40 },
      organizations: { nameLength: 40 },
      agents: { nameLength: 200 },
      connectors: { nameLength: 50 },
      sessions: { nameLength: 80 },
      turnSessions: { nameLength: 80 },
      workflows: { nameLength: 30 },
    });
    expect(data.installations.slice(0, 3).map(i => i.name)).toEqual([
      ...FIXTURE_INSTALLATIONS,
    ]);
    expect(data.installations[3].name.length).toBeGreaterThanOrEqual(40);
    for (const organization of data.organizations) {
      expect(organization.name.length).toBeGreaterThanOrEqual(40);
      expect(organization.displayName.length).toBeGreaterThanOrEqual(40);
    }
    for (const agent of data.agents) {
      // Cut at the limit, less a hyphen the cut would end on.
      expect(agent.name.length).toBeGreaterThanOrEqual(MAX_NAME_LENGTH - 1);
      expect(agent.name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
      expect(agent.name).toMatch(kubernetesName);
    }
    for (const connector of data.connectors) {
      expect(connector.name.length).toBeGreaterThanOrEqual(50);
    }
    for (const session of data.sessions) {
      // Whole words, not cut at the name's limit.
      expect(session.title.length).toBeGreaterThanOrEqual(MAX_NAME_LENGTH);
      expect(session.title).toMatch(/^([A-Z][a-z]+)( [A-Z][a-z]+)*$/);
    }
    for (const agent of data.agents) {
      expect(agent.displayName.toLowerCase().replace(/ /g, '-')).toMatch(
        new RegExp(`^${agent.name}`),
      );
    }
    for (const workflow of data.workflows) {
      expect(workflow.name.length).toBeGreaterThanOrEqual(30);
    }
    for (const namespace of namespacesOf(data.organizations)) {
      expect(namespace.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    }
  });

  it('takes the states given, in turn over the whole list', () => {
    const data = createFixtureDataSet({
      now,
      sessions: { count: 2, states: ['failed', 'ready'] },
      connectors: { states: ['Failed'] },
    });
    expect(data.sessions.map(s => s.state).slice(0, 4)).toEqual([
      'failed',
      'ready',
      'failed',
      'ready',
    ]);
    expect(statesOf(data.connectors)).toEqual(new Set(['Failed']));
  });

  it('refuses an empty list of states', () => {
    expect(() =>
      createFixtureDataSet({ now, workflows: { states: [] } }),
    ).toThrow('A builder needs at least one state.');
  });

  it('builds nothing under a parent list of none', () => {
    const data = createFixtureDataSet({ now, installations: { count: 0 } });
    expect(data).toEqual({
      installations: [],
      organizations: [],
      agents: [],
      connectors: [],
      sessions: [],
      workflows: [],
      executions: [],
      toolsetPresets: [],
      // The provider instances' owners and repositories are no
      // installation's.
      repositoryOwners: expect.any(Array),
      repositories: expect.any(Array),
      workspaces: [],
      toolchainSources: [],
      toolchains: [],
      skillRepositories: [],
    });
  });

  it('gives each installation toolset presets made from its connectors and workflows', () => {
    const data = createFixtureDataSet({ now });
    for (const { name } of data.installations) {
      const presets = data.toolsetPresets.filter(p => p.installation === name);
      expect(presets.map(p => p.name)).toEqual([
        'daily-checks',
        'reviews',
        'legacy-reports',
      ]);
      const connectors = new Set(
        data.connectors.filter(c => c.installation === name).map(c => c.name),
      );
      const workflows = new Set(
        data.workflows.filter(w => w.installation === name).map(w => w.name),
      );
      const [daily] = presets;
      for (const selector of daily.selectors) {
        const [kind, target] = selector.split(':');
        expect(kind === 'server' ? connectors : workflows).toContain(target);
      }
      expect(presets[2].selectors).toContain('server:retired-reports');
    }
  });
});

describe('baseDataSet', () => {
  it('builds the base data set once', () => {
    expect(baseDataSet()).toBe(baseDataSet());
    expect(baseDataSet().agents.length).toBeGreaterThan(0);
  });
});
