import { KagentSession } from '../../lib/kagentSessions';
import { AgentRow } from '../AgentsDataProvider';
import {
  buildAgentIndex,
  decodeAgentIdLabel,
  isListableSession,
  SESSION_TITLE_FALLBACK,
  sessionSearchFn,
  SessionRow,
  sortSessionRows,
  sortSessionsBy,
  toAgentIdentifier,
  toSessionRow,
} from './helpers';

function agent(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'gazelle/kagent/sre-agent',
    installation: 'gazelle',
    namespace: 'kagent',
    name: 'SRE agent',
    technicalName: 'sre-agent',
    description: '',
    skillCount: 0,
    ...overrides,
  };
}

function session(overrides: Partial<KagentSession> = {}): KagentSession {
  return {
    id: 'gazelle/abc',
    sessionId: 'abc',
    installation: 'gazelle',
    ...overrides,
  };
}

describe('toAgentIdentifier', () => {
  it('encodes namespace and name the way kagent does', () => {
    // ConvertToPythonIdentifier: every `-` → `_`, then `/` → `__NS__`.
    expect(toAgentIdentifier('kagent', 'k8s-agent')).toBe(
      'kagent__NS__k8s_agent',
    );
  });

  it('leaves a name without dashes alone', () => {
    expect(toAgentIdentifier('kagent', 'k8s')).toBe('kagent__NS__k8s');
  });

  it('encodes dashes in the namespace too', () => {
    expect(toAgentIdentifier('my-ns', 'my-agent')).toBe('my_ns__NS__my_agent');
  });
});

describe('toSessionRow — the agent join', () => {
  it('resolves the agent display name and avatar seed', () => {
    const index = buildAgentIndex([agent()]);

    const row = toSessionRow(
      session({ agentId: 'kagent__NS__sre_agent' }),
      index,
    );

    expect(row.agentName).toBe('SRE agent');
    expect(row.agentTechnicalName).toBe('sre-agent');
  });

  it('scopes the join per installation', () => {
    // The same agent_id exists on many installations, so a golem session must
    // not pick up gazelle's agent.
    const index = buildAgentIndex([agent()]);

    const row = toSessionRow(
      session({ installation: 'golem', agentId: 'kagent__NS__sre_agent' }),
      index,
    );

    expect(row.agentName).toBe('kagent/sre-agent'); // lossy decode fallback
    expect(row.agentTechnicalName).toBeUndefined();
  });

  it('falls back to a decoded label when no agent matched', () => {
    const row = toSessionRow(
      session({ agentId: 'kagent__NS__issue_tracker' }),
      new Map(),
    );

    expect(row.agentName).toBe('kagent/issue-tracker');
    expect(row.agentTechnicalName).toBeUndefined();
  });

  it('leaves the agent blank when the session references none', () => {
    const row = toSessionRow(session({ agentId: undefined }), new Map());

    expect(row.agentName).toBe('');
  });

  it('resolves an encode-collision deterministically', () => {
    // `sre-agent` and `sre_agent` both encode to kagent__NS__sre_agent, so the
    // join genuinely cannot tell them apart. The invariant that matters is that
    // the winner does not depend on the order the agents arrived in — which one
    // wins is down to locale collation and not worth pinning.
    const dash = agent({ technicalName: 'sre-agent', name: 'Dash agent' });
    const underscore = agent({
      technicalName: 'sre_agent',
      name: 'Underscore agent',
    });
    const target = session({ agentId: 'kagent__NS__sre_agent' });

    const oneOrder = toSessionRow(target, buildAgentIndex([dash, underscore]));
    const otherOrder = toSessionRow(
      target,
      buildAgentIndex([underscore, dash]),
    );

    expect(oneOrder.agentName).toBe(otherOrder.agentName);
    expect(['Dash agent', 'Underscore agent']).toContain(oneOrder.agentName);
  });
});

describe('toSessionRow — title', () => {
  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
  ])('falls back for %s', (_label, title) => {
    expect(
      toSessionRow(session({ title: title || undefined }), new Map()).title,
    ).toBe(SESSION_TITLE_FALLBACK);
  });

  it('keeps kagent’s truncated title verbatim', () => {
    // kagent derives titles from the first message and truncates to 20 chars, so
    // the ellipsis is real data.
    const row = toSessionRow(
      session({ title: 'What issues are assi...' }),
      new Map(),
    );

    expect(row.title).toBe('What issues are assi...');
  });
});

describe('decodeAgentIdLabel', () => {
  it('splits the namespace marker and restores dashes', () => {
    expect(decodeAgentIdLabel('kagent__NS__mega_k8s_sre')).toBe(
      'kagent/mega-k8s-sre',
    );
  });

  it('handles an id without the namespace marker', () => {
    expect(decodeAgentIdLabel('lonely_agent')).toBe('lonely-agent');
  });
});

describe('isListableSession', () => {
  it('excludes A2A subagent sessions', () => {
    expect(isListableSession(session({ source: 'agent' }))).toBe(false);
  });

  it.each([
    ['user', 'user'],
    ['an unknown future value', 'scheduled'],
    ['absent', undefined],
  ])('includes a session whose source is %s', (_label, source) => {
    // Absent is the real-world case: live v0.9.9 responses omit `source`, so this
    // filter hides nothing today and must not start hiding rows.
    expect(isListableSession(session({ source }))).toBe(true);
  });
});

describe('sortSessionRows', () => {
  function row(overrides: Partial<SessionRow>): SessionRow {
    return {
      id: 'gazelle/x',
      installation: 'gazelle',
      title: 'x',
      agentName: '',
      ...overrides,
    };
  }

  it('orders most recent activity first', () => {
    const sorted = sortSessionRows([
      row({ id: 'a', updatedAt: '2026-07-20T10:00:00Z' }),
      row({ id: 'b', updatedAt: '2026-07-23T10:00:00Z' }),
    ]);

    expect(sorted.map(r => r.id)).toEqual(['b', 'a']);
  });

  it('puts rows with no timestamp last', () => {
    const sorted = sortSessionRows([
      row({ id: 'none' }),
      row({ id: 'dated', updatedAt: '2026-07-20T10:00:00Z' }),
    ]);

    expect(sorted.map(r => r.id)).toEqual(['dated', 'none']);
  });

  it('does not mutate its input', () => {
    const input = [
      row({ id: 'a', updatedAt: '2026-07-20T10:00:00Z' }),
      row({ id: 'b', updatedAt: '2026-07-23T10:00:00Z' }),
    ];
    sortSessionRows(input);

    expect(input.map(r => r.id)).toEqual(['a', 'b']);
  });
});

describe('sortSessionsBy', () => {
  function row(overrides: Partial<SessionRow>): SessionRow {
    return {
      id: 'gazelle/x',
      installation: 'gazelle',
      title: 'x',
      agentName: '',
      ...overrides,
    };
  }

  const rows = [
    row({ id: 'old', createdAt: '2026-07-20T10:00:00Z', title: 'b' }),
    row({ id: 'new', createdAt: '2026-07-23T10:00:00Z', title: 'a' }),
    row({ id: 'unknown', title: 'c' }),
  ];

  it('sorts a timestamp column ascending', () => {
    const sorted = sortSessionsBy(rows, {
      column: 'createdAt',
      direction: 'ascending',
    });

    expect(sorted.map(r => r.id)).toEqual(['old', 'new', 'unknown']);
  });

  it('sorts a timestamp column descending', () => {
    const sorted = sortSessionsBy(rows, {
      column: 'createdAt',
      direction: 'descending',
    });

    expect(sorted.map(r => r.id)).toEqual(['new', 'old', 'unknown']);
  });

  it('keeps unknown timestamps last in both directions', () => {
    // "Unknown" is not "oldest", so it must not lead the ascending sort.
    for (const direction of ['ascending', 'descending'] as const) {
      const sorted = sortSessionsBy(rows, { column: 'createdAt', direction });
      expect(sorted[sorted.length - 1].id).toBe('unknown');
    }
  });

  it('sorts a text column', () => {
    const sorted = sortSessionsBy(rows, {
      column: 'title',
      direction: 'ascending',
    });

    expect(sorted.map(r => r.title)).toEqual(['a', 'b', 'c']);
  });
});

describe('sessionSearchFn', () => {
  const rows: SessionRow[] = [
    {
      id: '1',
      installation: 'gazelle',
      title: 'Redis OOM triage',
      agentName: 'SRE agent',
    },
    {
      id: '2',
      installation: 'golem',
      title: 'Ingress question',
      agentName: 'Issue tracker',
    },
  ];

  it('matches on the title', () => {
    expect(sessionSearchFn(rows, 'redis').map(r => r.id)).toEqual(['1']);
  });

  it('matches on the agent name', () => {
    expect(sessionSearchFn(rows, 'tracker').map(r => r.id)).toEqual(['2']);
  });

  it('matches on the installation', () => {
    expect(sessionSearchFn(rows, 'golem').map(r => r.id)).toEqual(['2']);
  });

  it('is case-insensitive and trims', () => {
    expect(sessionSearchFn(rows, '  OOM  ').map(r => r.id)).toEqual(['1']);
  });

  it('returns everything for an empty query', () => {
    expect(sessionSearchFn(rows, '   ')).toHaveLength(2);
  });
});
