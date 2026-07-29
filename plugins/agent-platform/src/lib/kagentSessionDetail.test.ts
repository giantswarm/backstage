import {
  normalizeSessionDetail,
  normalizeTaskList,
} from './kagentSessionDetail';

import detailV099 from './__fixtures__/session-detail.v0-9-9.json';
import detailV010 from './__fixtures__/session-detail.v0-10.json';
import detailNoEvents from './__fixtures__/session-detail.no-events.json';
import detailBare from './__fixtures__/session-detail.bare.json';
import detailNoSession from './__fixtures__/session-detail.no-session.json';
import tasksV099 from './__fixtures__/tasks.v0-9-9.json';
import tasksEmpty from './__fixtures__/tasks.empty-no-data.json';
import tasksBareArray from './__fixtures__/tasks.bare-array.json';
import tasksErrorEnvelope from './__fixtures__/tasks.error-envelope.json';
import tasksDataNotArray from './__fixtures__/tasks.data-not-array.json';
import tasksMalformed from './__fixtures__/tasks.malformed.json';

describe('normalizeSessionDetail', () => {
  it('reads the session', () => {
    const { detail, drift } = normalizeSessionDetail(detailV099, 'gazelle');

    expect(drift).toBeUndefined();
    expect(detail?.session).toMatchObject({
      sessionId:
        '5f3e1a2b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f',
      installation: 'gazelle',
      title: 'Which GitHub issues...',
      agentId: 'kagent__NS__issue_tracker',
    });
  });

  it('ignores the events array entirely', () => {
    // Events are not the conversation, and — despite kagent's Go doc comment —
    // not A2A messages either, so there is no messageId to join task history
    // against. Asserted so nobody reintroduces a dependency on them without
    // re-checking a real payload.
    const { detail } = normalizeSessionDetail(detailV099, 'gazelle');

    expect(detail).toEqual({
      session: expect.objectContaining({ installation: 'gazelle' }),
      readOnly: undefined,
    });
  });

  it('keeps the session id verbatim whatever shape it has', () => {
    // Real responses mix 64-char hex and UUIDs, so nothing may assume a format.
    const { detail } = normalizeSessionDetail(detailV010, 'gazelle');

    expect(detail?.session.sessionId).toBe(
      '019f8a13-c6c2-73af-a1d9-ab0abeeb6734',
    );
  });

  it('reads v0.10 read_only and ignores its absence on v0.9.9', () => {
    expect(normalizeSessionDetail(detailV010, 'gazelle').detail?.readOnly).toBe(
      true,
    );
    expect(
      normalizeSessionDetail(detailV099, 'gazelle').detail?.readOnly,
    ).toBeUndefined();
  });

  it('accepts a response with no events at all', () => {
    const { detail, drift } = normalizeSessionDetail(detailNoEvents, 'gazelle');

    expect(drift).toBeUndefined();
    expect(detail?.session.sessionId).toBe('abc');
  });

  it('accepts a bare object if a future version drops the envelope', () => {
    const { detail, drift } = normalizeSessionDetail(detailBare, 'gazelle');

    expect(drift).toBeUndefined();
    expect(detail?.session.title).toBe('No envelope');
  });

  it('reports an in-band error rather than looking like a missing session', () => {
    // The backend classifies on HTTP status alone and passes any 2xx body
    // through, so the envelope's error flag is ours to check.
    const { detail, drift } = normalizeSessionDetail(
      { error: true, message: 'Session not found' },
      'gazelle',
    );

    expect(detail).toBeUndefined();
    expect(drift).toEqual({
      kind: 'error-envelope',
      message: 'Session not found',
    });
  });

  it('reports a body that carried no readable session', () => {
    const { detail, drift } = normalizeSessionDetail(
      detailNoSession,
      'gazelle',
    );

    expect(detail).toBeUndefined();
    expect(drift?.kind).toBe('skipped-rows');
  });

  it.each([undefined, null, 0, 'nope', [], [null]])(
    'never throws on %p',
    input => {
      expect(() => normalizeSessionDetail(input, 'gazelle')).not.toThrow();
    },
  );

  it('is unaffected by malformed events', () => {
    // The v0.9.9 fixture deliberately includes a Go zero-time event and one with
    // a truncated payload. Since events are not read, neither can affect the
    // result — which is the point of not reading them.
    const { detail, drift } = normalizeSessionDetail(detailV099, 'gazelle');

    expect(drift).toBeUndefined();
    expect(detail?.session.sessionId).toBeTruthy();
  });
});

describe('normalizeTaskList', () => {
  it('reads tasks in kagent’s chronological order', () => {
    const { tasks, drift } = normalizeTaskList(tasksV099);

    expect(drift).toBeUndefined();
    expect(tasks.map(task => task.id)).toEqual(['task-1', 'task-2']);
  });

  it('treats an absent data key as no tasks', () => {
    // Go's omitempty drops a zero-length slice, so there is no empty array on the
    // wire — and a session created but never run is ordinary, not drift.
    expect(normalizeTaskList(tasksEmpty)).toEqual({ tasks: [] });
  });

  it('accepts a bare top-level array', () => {
    expect(normalizeTaskList(tasksBareArray).tasks).toHaveLength(1);
  });

  it('reports an in-band error', () => {
    expect(normalizeTaskList(tasksErrorEnvelope)).toEqual({
      tasks: [],
      drift: {
        kind: 'error-envelope',
        message: 'Failed to get events for session',
      },
    });
  });

  it('reports a data key that is present but not an array', () => {
    expect(normalizeTaskList(tasksDataNotArray).drift).toEqual({
      kind: 'data-not-array',
      message: 'data was present but not an array',
    });
  });

  it('skips unreadable rows and says how many', () => {
    const { tasks, drift } = normalizeTaskList(tasksMalformed);

    expect(tasks.map(task => task.id)).toEqual(['task-ok', 'task-no-history']);
    expect(drift).toEqual({
      kind: 'skipped-rows',
      message: 'skipped 3 unreadable task rows',
    });
  });

  it.each([undefined, null, 0, 'nope'])('never throws on %p', input => {
    expect(() => normalizeTaskList(input)).not.toThrow();
  });
});
