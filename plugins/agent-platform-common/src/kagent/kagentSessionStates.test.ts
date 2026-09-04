import { normalizeSessionStates } from './kagentSessionStates';

describe('normalizeSessionStates', () => {
  it('reads a well-formed summary', () => {
    expect(
      normalizeSessionStates({
        evaluatedAt: 1757000000000,
        states: [
          { sessionId: 'a', state: 'input-required', changedAt: 1756999000000 },
          { sessionId: 'b', state: 'completed' },
        ],
        unreadable: ['c'],
        skipped: 7,
      }),
    ).toEqual({
      evaluatedAt: 1757000000000,
      states: [
        { sessionId: 'a', state: 'input-required', changedAt: 1756999000000 },
        { sessionId: 'b', state: 'completed' },
      ],
      unreadable: ['c'],
      skipped: 7,
    });
  });

  it('keeps a null state distinct from a missing one', () => {
    // `null` means the session has tasks but none reported a state — created and
    // never run. It is not terminal, and it is not "we did not look".
    const { states } = normalizeSessionStates({
      states: [{ sessionId: 'a', state: null }, { sessionId: 'b' }],
    });

    expect(states).toEqual([
      { sessionId: 'a', state: null },
      { sessionId: 'b', state: null },
    ]);
  });

  it('drops a malformed entry rather than the whole summary', () => {
    // Same rule as normalizeSessionList: one bad row must not cost the rail
    // every other row.
    const { states } = normalizeSessionStates({
      states: [
        { sessionId: 'good', state: 'working' },
        { state: 'working' },
        'not an object',
        { sessionId: 42, state: 'working' },
        { sessionId: 'also-good', state: 'completed' },
      ],
    });

    expect(states.map(s => s.sessionId)).toEqual(['good', 'also-good']);
  });

  it('passes unknown future fields through without complaint', () => {
    const { states } = normalizeSessionStates({
      states: [{ sessionId: 'a', state: 'working', somethingNew: true }],
    });

    expect(states).toEqual([{ sessionId: 'a', state: 'working' }]);
  });

  it('tolerates an unrecognised state verbatim', () => {
    // The state map is deliberately a lookup, not an enum — a state we have
    // never seen must reach the UI as itself.
    const { states } = normalizeSessionStates({
      states: [{ sessionId: 'a', state: 'quantum-superposition' }],
    });

    expect(states[0].state).toBe('quantum-superposition');
  });

  it.each([
    ['a body that is not an object', 'nope'],
    ['null', null],
    ['an empty object', {}],
    ['a body whose states is not an array', { states: 'nope' }],
  ])('yields an empty summary for %s', (_label, body) => {
    expect(normalizeSessionStates(body)).toEqual({
      evaluatedAt: 0,
      states: [],
      unreadable: [],
      skipped: 0,
    });
  });

  it('drops non-string entries from unreadable', () => {
    expect(
      normalizeSessionStates({ unreadable: ['a', 7, null, 'b'] }).unreadable,
    ).toEqual(['a', 'b']);
  });
});
