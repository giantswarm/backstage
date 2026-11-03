import type { AgentRow } from '../components/AgentsDataProvider';
import type { SessionRow } from '../components/SessionsDataProvider/helpers';
import { recentAgents, recentAgentUses } from './recentAgents';

function agent(name: string, overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: `gazelle/kagent/${name}`,
    installation: 'gazelle',
    namespace: 'kagent',
    name,
    technicalName: name,
    description: '',
    skillCount: 0,
    readiness: 'ready',
    ...overrides,
  };
}

function session(
  id: string,
  agentName: string | undefined,
  createdAt: string,
): SessionRow {
  return {
    id: `gazelle/${id}`,
    sessionId: id,
    installation: 'gazelle',
    title: id,
    agentName: agentName ?? '',
    agentTechnicalName: agentName,
    agentNamespace: agentName ? 'kagent' : undefined,
    createdAt,
  };
}

const sre = agent('sre');
const issues = agent('issues');
const docs = agent('docs');
const extra = agent('extra');
const broken = agent('broken', { readiness: 'notReady' });

describe('recentAgents', () => {
  it('lists the agents of the newest sessions first, each once, up to the limit', () => {
    const sessions = [
      session('a', 'sre', '2026-10-01T10:00:00Z'),
      session('b', 'issues', '2026-10-03T10:00:00Z'),
      session('c', 'sre', '2026-10-04T10:00:00Z'),
      session('d', 'docs', '2026-10-02T10:00:00Z'),
      session('e', 'extra', '2026-09-01T10:00:00Z'),
    ];

    expect(recentAgents(sessions, [sre, issues, docs, extra])).toEqual([
      sre,
      issues,
      docs,
    ]);
  });

  it('skips sessions whose agent is unknown or cannot be started', () => {
    const sessions = [
      session('a', undefined, '2026-10-04T10:00:00Z'),
      session('b', 'broken', '2026-10-03T10:00:00Z'),
      session('c', 'gone', '2026-10-02T10:00:00Z'),
      session('d', 'sre', '2026-10-01T10:00:00Z'),
    ];

    expect(recentAgents(sessions, [sre, broken])).toEqual([sre]);
  });
});

describe('recentAgentUses', () => {
  it('pairs each recent agent with its latest session', () => {
    const sessions = [
      session('a', 'sre', '2026-10-01T10:00:00Z'),
      session('b', 'issues', '2026-10-03T10:00:00Z'),
      session('c', 'sre', '2026-10-04T10:00:00Z'),
    ];

    expect(recentAgentUses(sessions, [sre, issues])).toEqual([
      { agent: sre, lastUsedAt: '2026-10-04T10:00:00Z' },
      { agent: issues, lastUsedAt: '2026-10-03T10:00:00Z' },
    ]);
  });

  it('keeps an agent that cannot be started when asked to', () => {
    const sessions = [
      session('a', 'broken', '2026-10-04T10:00:00Z'),
      session('b', 'sre', '2026-10-03T10:00:00Z'),
    ];

    expect(
      recentAgentUses(sessions, [sre, broken]).map(use => use.agent),
    ).toEqual([sre]);
    expect(
      recentAgentUses(sessions, [sre, broken], { startableOnly: false }).map(
        use => use.agent,
      ),
    ).toEqual([broken, sre]);
  });

  it('stays at the limit over 300 sessions with 300 agents', () => {
    const agents = Array.from({ length: 300 }, (_, i) => agent(`a${i}`));
    const sessions = agents.map((each, i) =>
      session(
        `s${i}`,
        each.technicalName,
        new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
      ),
    );

    expect(
      recentAgentUses(sessions, agents).map(use => use.agent.name),
    ).toEqual(['a299', 'a298', 'a297']);
  });
});
