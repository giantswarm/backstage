import { FIXTURE_INSTALLATION } from '../fixtureMode';
import {
  AGENT_STATES,
  CONNECTOR_STATES,
  EXECUTION_STATES,
  INSTALLATION_STATES,
  MAX_NAME_LENGTH,
  ORGANIZATION_STATES,
  SESSION_STATES,
  WORKFLOW_STATES,
  baseDataSet,
  createFixtureDataSet,
  inInstallation,
} from '.';

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

  it('has several installations, the served one first and reachable', () => {
    const { installations } = createFixtureDataSet({ now });
    expect(installations.length).toBeGreaterThan(1);
    expect(installations[0]).toEqual({
      name: FIXTURE_INSTALLATION,
      state: 'reachable',
    });
    expect(
      installations.slice(1).map(installation => installation.name),
    ).not.toContain(FIXTURE_INSTALLATION);
  });

  it('has every state of every list in the base data set', () => {
    const data = createFixtureDataSet({ now });
    expect(statesOf(data.installations)).toEqual(new Set(INSTALLATION_STATES));
    expect(statesOf(data.organizations)).toEqual(new Set(ORGANIZATION_STATES));
    expect(statesOf(data.agents)).toEqual(new Set(AGENT_STATES));
    expect(statesOf(data.connectors)).toEqual(new Set(CONNECTOR_STATES));
    expect(statesOf(data.sessions)).toEqual(new Set(SESSION_STATES));
    expect(statesOf(data.workflows)).toEqual(new Set(WORKFLOW_STATES));
    expect(statesOf(data.executions)).toEqual(new Set(EXECUTION_STATES));
  });

  it('has every state in the served installation', () => {
    const data = createFixtureDataSet({ now });
    const served = <T extends { installation: string }>(items: T[]) =>
      inInstallation(items, FIXTURE_INSTALLATION);
    expect(statesOf(served(data.organizations))).toEqual(
      new Set(ORGANIZATION_STATES),
    );
    expect(statesOf(served(data.connectors))).toEqual(
      new Set(CONNECTOR_STATES),
    );
    expect(statesOf(served(data.sessions))).toEqual(new Set(SESSION_STATES));
    expect(statesOf(served(data.executions))).toEqual(
      new Set(EXECUTION_STATES),
    );
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
      expect(completed ?? started + execution.durationMs).toBe(
        started + execution.durationMs,
      );
      expect(execution.error !== undefined).toBe(execution.state === 'failed');
    }
  });
});

describe('builder settings', () => {
  it('makes count items per parent', () => {
    const data = createFixtureDataSet({
      now,
      installations: { count: 2 },
      organizations: { count: 3, states: ['ready'] },
      agents: { count: 5 },
      connectors: { count: 7 },
      sessions: { count: 4 },
      workflows: { count: 1 },
      executions: { count: 6 },
    });
    expect(data.installations).toHaveLength(2);
    expect(data.organizations).toHaveLength(2 * 3);
    expect(data.agents).toHaveLength(2 * 3 * 5);
    expect(data.connectors).toHaveLength(2 * 7);
    expect(data.sessions).toHaveLength(2 * 3 * 5 * 4);
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
      installations: { nameLength: 40 },
      organizations: { nameLength: 40 },
      agents: { nameLength: 200 },
      connectors: { nameLength: 50 },
      sessions: { nameLength: 80 },
      workflows: { nameLength: 30 },
    });
    for (const installation of data.installations.slice(1)) {
      expect(installation.name.length).toBeGreaterThanOrEqual(40);
    }
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
      expect(session.title.length).toBeGreaterThanOrEqual(MAX_NAME_LENGTH - 1);
    }
    for (const workflow of data.workflows) {
      expect(workflow.name.length).toBeGreaterThanOrEqual(30);
    }
    for (const namespace of namespacesOf(data.organizations)) {
      expect(namespace.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    }
  });

  it('keeps the served installation its name, whatever the name length', () => {
    const { installations } = createFixtureDataSet({
      now,
      installations: { nameLength: 50 },
    });
    expect(installations[0].name).toBe(FIXTURE_INSTALLATION);
  });

  it('takes the states given, in turn over the whole list', () => {
    const data = createFixtureDataSet({
      now,
      sessions: { count: 1, states: ['failed', 'ready'] },
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
    });
  });
});

describe('baseDataSet', () => {
  it('builds the base data set once', () => {
    expect(baseDataSet()).toBe(baseDataSet());
    expect(baseDataSet().agents.length).toBeGreaterThan(0);
  });
});
