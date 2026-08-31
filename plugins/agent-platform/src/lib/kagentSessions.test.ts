import bareArray from './__fixtures__/sessions.bare-array.json';
import dataNotArray from './__fixtures__/sessions.data-not-array.json';
import dataNull from './__fixtures__/sessions.data-null.json';
import errorEnvelope from './__fixtures__/sessions.error-envelope.json';
import emptyNoData from './__fixtures__/sessions.empty-no-data.json';
import futureUnknownSource from './__fixtures__/sessions.future-unknown-source.json';
import futureV0_11 from './__fixtures__/sessions.future-v0-11.json';
import malformed from './__fixtures__/sessions.malformed.json';
import realV0_9_9 from './__fixtures__/sessions.real-v0-9-9.json';
import v0_10 from './__fixtures__/sessions.v0-10.json';
import v0_9_9 from './__fixtures__/sessions.v0-9-9.json';
import {
  normalizeSessionList,
  normalizeTimestamp,
  parseCreatedSessionId,
} from './kagentSessions';

describe('normalizeSessionList — version matrix', () => {
  // The contract this whole layer exists for: kagent ships no OpenAPI spec and
  // the fleet runs mixed versions, so the same logical sessions must normalize
  // identically no matter which version served them.
  it('normalizes v0.9.9 and v0.10 to identical output', () => {
    const from0_9_9 = normalizeSessionList(v0_9_9, 'gazelle');
    const from0_10 = normalizeSessionList(v0_10, 'gazelle');

    expect(from0_9_9.sessions).toEqual(from0_10.sessions);
    expect(from0_9_9.drift).toBeUndefined();
    expect(from0_10.drift).toBeUndefined();
  });

  it('ignores unknown fields a future version adds', () => {
    // read_only, labels, nested metadata, state — none of it may change the
    // domain objects.
    expect(normalizeSessionList(futureV0_11, 'gazelle').sessions).toEqual(
      normalizeSessionList(v0_10, 'gazelle').sessions,
    );
  });

  it('preserves an unknown source value verbatim', () => {
    // Must not be coerced, and especially must not be treated as 'agent' —
    // which the provider filters out.
    const { sessions } = normalizeSessionList(futureUnknownSource, 'gazelle');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].source).toBe('scheduled');
  });
});

describe('normalizeSessionList — the captured live response', () => {
  it('normalizes all ten real sessions', () => {
    const { sessions, drift } = normalizeSessionList(realV0_9_9, 'gazelle');

    expect(sessions).toHaveLength(10);
    expect(drift).toBeUndefined();
  });

  it('preserves both real id shapes verbatim', () => {
    // Live data mixes 64-char hex ids and UUIDs, so nothing may assume or
    // validate a format.
    const { sessions } = normalizeSessionList(realV0_9_9, 'gazelle');
    const ids = sessions.map(session => session.sessionId);

    expect(ids).toContain(
      'f43d209450a0c9574e4e5a8d77265f37bf5a09a5c35f1a4598787ae33d2d2fe1',
    );
    expect(ids).toContain('019f8a13-c6c2-73af-a1d9-ab0abeeb6734');
  });

  it('keeps every row listable even though source is absent throughout', () => {
    const { sessions } = normalizeSessionList(realV0_9_9, 'gazelle');

    expect(sessions.every(session => session.source === undefined)).toBe(true);
  });

  it('keeps kagent’s server-truncated titles as-is', () => {
    const { sessions } = normalizeSessionList(realV0_9_9, 'gazelle');

    // kagent derives titles from the first message and truncates to 20 chars,
    // so the ellipsis is real data, not our doing.
    expect(sessions[0].title).toBe('What issues are assi...');
  });

  it('scopes ids by installation so the same session can appear twice', () => {
    const onGazelle = normalizeSessionList(realV0_9_9, 'gazelle').sessions;
    const onGolem = normalizeSessionList(realV0_9_9, 'golem').sessions;

    expect(onGazelle[0].id).toBe(`gazelle/${onGazelle[0].sessionId}`);
    expect(onGolem[0].id).toBe(`golem/${onGolem[0].sessionId}`);
    expect(onGazelle[0].id).not.toBe(onGolem[0].id);
  });
});

describe('normalizeSessionList — envelope tolerance', () => {
  it('treats an absent data key as an empty list', () => {
    // Go's omitempty drops a zero-length slice, so this is what "no sessions"
    // actually looks like on the wire.
    expect(normalizeSessionList(emptyNoData, 'gazelle')).toEqual({
      sessions: [],
    });
  });

  it('treats a null data value as an empty list', () => {
    expect(normalizeSessionList(dataNull, 'gazelle')).toEqual({ sessions: [] });
  });

  it('accepts a bare top-level array', () => {
    const { sessions, drift } = normalizeSessionList(bareArray, 'gazelle');

    expect(sessions).toHaveLength(1);
    expect(drift).toBeUndefined();
  });

  it('reports drift when data is present but not an array', () => {
    const { sessions, drift } = normalizeSessionList(dataNotArray, 'gazelle');

    expect(sessions).toEqual([]);
    expect(drift).toEqual({
      kind: 'data-not-array',
      message: 'data was present but not an array',
    });
  });

  it('reports an in-band error rather than an innocuous empty list', () => {
    // kagent can fail on a 200: the backend classifies only on HTTP status and
    // passes any 2xx body through verbatim, so without this check
    // `{error: true, data: null}` would be indistinguishable from "this user has
    // no sessions" — an empty table and nothing logged anywhere.
    const { sessions, drift } = normalizeSessionList(errorEnvelope, 'gazelle');

    expect(sessions).toEqual([]);
    expect(drift).toEqual({
      kind: 'error-envelope',
      message: 'failed to list sessions: database connection lost',
    });
  });

  it('falls back to a generic message when the error carries none', () => {
    const { drift } = normalizeSessionList({ error: true }, 'gazelle');

    expect(drift?.kind).toBe('error-envelope');
    expect(drift?.message).toBe('kagent reported an error in the envelope');
  });
});

describe('normalizeSessionList — malformed input', () => {
  it('skips unreadable rows instead of losing the whole list', () => {
    const { sessions, drift } = normalizeSessionList(malformed, 'gazelle');

    // One row has weird types but a usable id; the `{}` and `null` rows have no
    // id and are dropped.
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe('sess-weird-types');
    expect(drift).toEqual({
      kind: 'skipped-rows',
      message: 'skipped 2 unreadable session rows',
    });
  });

  it('degrades individual bad fields to undefined', () => {
    const { sessions } = normalizeSessionList(malformed, 'gazelle');

    expect(sessions[0].title).toBeUndefined(); // name was 42
    expect(sessions[0].agentId).toBeUndefined(); // agent_id was {}
    expect(sessions[0].createdAt).toBeUndefined(); // created_at was 'not-a-date'
    expect(sessions[0].updatedAt).toBeDefined(); // this one was valid
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 0],
    ['a string', 'nope'],
    ['a bare object', { a: 1 }],
    ['a nested non-list', { data: { a: 1 } }],
  ])('never throws on %s', (_label, input) => {
    expect(() => normalizeSessionList(input, 'gazelle')).not.toThrow();
    expect(normalizeSessionList(input, 'gazelle').sessions).toEqual([]);
  });
});

describe('normalizeTimestamp', () => {
  it('accepts a real RFC3339 timestamp with microseconds', () => {
    expect(normalizeTimestamp('2026-07-23T16:04:28.586641Z')).toBe(
      '2026-07-23T16:04:28.586641Z',
    );
  });

  it.each([
    ['Go zero time', '0001-01-01T00:00:00Z'],
    ['the unix epoch', '1970-01-01T00:00:00Z'],
    ['an empty string', ''],
    ['undefined', undefined],
    ['an unparseable string', 'not-a-date'],
  ])('rejects %s', (_label, input) => {
    expect(normalizeTimestamp(input)).toBeUndefined();
  });

  it('drops both timestamps for a never-updated session', () => {
    // Go serializes an unset non-pointer time.Time as year 0001, which browsers
    // render as "Dec 31, 0000" if it reaches them.
    const zeroTime = require('./__fixtures__/sessions.zero-time.json');
    const { sessions } = normalizeSessionList(zeroTime, 'gazelle');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].createdAt).toBeUndefined();
    expect(sessions[0].updatedAt).toBeUndefined();
  });
});

describe('parseCreatedSessionId', () => {
  it('reads the id out of the envelope', () => {
    expect(
      parseCreatedSessionId({
        error: false,
        data: { id: 'abc123', name: 'Why is the ingress failing?' },
        message: 'Successfully created session',
      }),
    ).toBe('abc123');
  });

  it('ignores everything else in the payload', () => {
    // The rest of the session is re-read from the list and the detail endpoint,
    // both of which normalize it. Only the id is needed to navigate.
    expect(
      parseCreatedSessionId({
        error: false,
        data: {
          id: 'abc123',
          agent_id: 'kagent__NS__sre_agent',
          share_token: 'something-from-a-future-version',
        },
      }),
    ).toBe('abc123');
  });

  it.each([
    ['an error envelope', { error: true, message: 'nope' }],
    ['no data key at all', { error: false }],
    ['a null data', { error: false, data: null }],
    ['a data that is not an object', { error: false, data: 'abc123' }],
    ['a session without an id', { error: false, data: { name: 'Titled' } }],
    ['an empty id', { error: false, data: { id: '' } }],
    ['a non-string id', { error: false, data: { id: 42 } }],
    ['a bare string', 'abc123'],
    ['nothing', undefined],
  ])('yields undefined for %s', (_label, payload) => {
    // Unlike the list, this cannot degrade to an empty result: without an id
    // there is nowhere to navigate, so the caller has to say so.
    expect(parseCreatedSessionId(payload)).toBeUndefined();
  });

  it('refuses an id reported alongside error: true', () => {
    // kagent reports some refusals with a 200 and `{error: true}`, which the
    // status code alone would let through.
    expect(
      parseCreatedSessionId({ error: true, data: { id: 'abc123' } }),
    ).toBeUndefined();
  });
});
