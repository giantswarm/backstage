import sessions from './__fixtures__/sessions.kagent-a8353a0.json';
import session from './__fixtures__/session.kagent-a8353a0.json';
import bareDetail from './__fixtures__/session-detail.bare.json';
import v0_10 from './__fixtures__/sessions.v0-10.json';
import {
  encodeKagentAgentId,
  isSessionRecordEnvelope,
  isSessionRecordList,
  normalizeRuntimeState,
} from './kagentSessionRecord';
import { normalizeSessionDetail } from './kagentSessionDetail';
import {
  isListableSession,
  normalizeSessionList,
  parseCreatedSessionId,
} from './kagentSessions';

describe('Session records as sessions (kagent API v2, recorded on kagent-a8353a0)', () => {
  it('tells a ListSessionsResponse from a 0.10 envelope', () => {
    expect(isSessionRecordList(sessions)).toBe(true);
    expect(isSessionRecordList(v0_10)).toBe(false);
    expect(isSessionRecordEnvelope(session)).toBe(true);
    expect(isSessionRecordEnvelope({ data: { session: {} } })).toBe(false);
    // The un-enveloped 0.10 detail also carries `session`, as a 0.10 row.
    expect(isSessionRecordEnvelope(bareDetail)).toBe(false);
  });

  it('normalizes the listing into sessions with the record’s own facts', () => {
    const { sessions: rows, drift } = normalizeSessionList(sessions, 'lab');

    expect(drift).toBeUndefined();
    expect(rows).toHaveLength(1);
    const [first] = rows;
    expect(first).toEqual(
      expect.objectContaining({
        id: `lab/${first.sessionId}`,
        installation: 'lab',
        title: expect.any(String),
        agent: { namespace: 'kagent', name: expect.any(String) },
        agentId: encodeKagentAgentId('kagent', first.agent!.name),
        source: 'user',
        state: 'ready',
        contextId: expect.any(String),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      }),
    );
    // Every session the controller lists for a caller is theirs to see.
    expect(rows.every(isListableSession)).toBe(true);
  });

  it('renders each runtime state as a word and a failed session with its reason', () => {
    const real = sessions.sessions[0];
    const withState = (state: string, extra: Record<string, unknown> = {}) => ({
      ...real,
      id: `${real.id}-${state}`,
      state,
      ...extra,
    });
    const { sessions: rows, drift } = normalizeSessionList(
      {
        sessions: [
          withState('RUNTIME_STATE_SUSPENDED'),
          withState('RUNTIME_STATE_READY'),
          withState('RUNTIME_STATE_FAILED', {
            failure: { reason: 'no ready revision' },
          }),
        ],
      },
      'lab',
    );
    expect(drift).toBeUndefined();
    expect(rows.map(s => s.state)).toEqual(['suspended', 'ready', 'failed']);
    expect(rows[2].failure).toEqual(
      expect.objectContaining({ reason: 'no ready revision' }),
    );
    expect(rows.every(isListableSession)).toBe(true);
  });

  it('reads the created session’s id out of the create response', () => {
    expect(parseCreatedSessionId(session)).toBe(session.session.id);
    expect(parseCreatedSessionId({ session: {} })).toBeUndefined();
    expect(parseCreatedSessionId({})).toBeUndefined();
  });

  it('normalizes a one-session response into a session detail', () => {
    const { detail, drift } = normalizeSessionDetail(session, 'lab');

    expect(drift).toBeUndefined();
    expect(detail?.session.sessionId).toBe(session.session.id);
    expect(detail?.session.state).toBe('ready');
    // Records carry no read-only flag.
    expect(detail?.readOnly).toBeUndefined();
  });

  it('treats an empty response as an empty list, not drift', () => {
    // proto3 JSON omits an empty repeated field entirely.
    expect(normalizeSessionList({}, 'lab')).toEqual({ sessions: [] });
    expect(normalizeSessionList({ sessions: [] }, 'lab')).toEqual({
      sessions: [],
    });
  });

  it('skips a record without an id and says so, keeping the rest', () => {
    const { sessions: rows, drift } = normalizeSessionList(
      { sessions: [{ name: 'no id' }, null, sessions.sessions[0]] },
      'lab',
    );

    expect(rows).toHaveLength(1);
    expect(drift).toEqual({
      kind: 'skipped-rows',
      message: 'skipped 2 unreadable session rows',
    });
  });

  it('keeps unknown fields and unknown states out of the way', () => {
    const { sessions: rows } = normalizeSessionList(
      {
        sessions: [
          {
            ...sessions.sessions[0],
            state: 'RUNTIME_STATE_HIBERNATING',
            labels: { team: 'bumblebee' },
          },
        ],
      },
      'lab',
    );
    expect(rows[0].state).toBe('hibernating');
  });

  it('spells runtime states as one lower-case word', () => {
    expect(normalizeRuntimeState('RUNTIME_STATE_READY')).toBe('ready');
    expect(normalizeRuntimeState('ready')).toBe('ready');
    expect(normalizeRuntimeState(undefined)).toBeUndefined();
  });

  it('encodes an agent reference the way kagent’s python identifier does', () => {
    expect(encodeKagentAgentId('kagent', 'k8s-agent')).toBe(
      'kagent__NS__k8s_agent',
    );
  });
});
