import { DEFAULT_MAX_AGE_MS } from './sessionStates';
import { selectCandidates } from './sessionFanOut';

const NOW = Date.parse('2026-09-04T12:00:00.000Z');
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe('selectCandidates', () => {
  const opts = { now: NOW, maxAgeMs: DEFAULT_MAX_AGE_MS, maxSessions: 20 };

  it('orders by last activity, newest first', () => {
    const { candidates: picked } = selectCandidates(
      [
        { sessionId: 'old', updatedAt: '2026-09-02T10:00:00Z' },
        { sessionId: 'new', updatedAt: '2026-09-04T10:00:00Z' },
        { sessionId: 'mid', updatedAt: '2026-09-03T10:00:00Z' },
      ],
      opts,
    );

    expect(picked.map(s => s.sessionId)).toEqual(['new', 'mid', 'old']);
  });

  it('caps the number of candidates, keeping the most recent', () => {
    const sessions = Array.from({ length: 30 }, (_, i) => ({
      sessionId: `s${i}`,
      updatedAt: new Date(NOW - i * MINUTE).toISOString(),
    }));

    const { candidates: picked } = selectCandidates(sessions, {
      ...opts,
      maxSessions: 20,
    });

    expect(picked).toHaveLength(20);
    expect(picked[0].sessionId).toBe('s0');
    expect(picked[19].sessionId).toBe('s19');
  });

  it('drops sessions outside the activity window', () => {
    const { candidates: picked } = selectCandidates(
      [
        { sessionId: 'recent', updatedAt: new Date(NOW - DAY).toISOString() },
        {
          sessionId: 'stale',
          updatedAt: new Date(NOW - 30 * DAY).toISOString(),
        },
      ],
      opts,
    );

    expect(picked.map(s => s.sessionId)).toEqual(['recent']);
  });

  it('keeps a session that waited for days, well inside the window', () => {
    // The whole point of a seven-day window rather than a tight one: a session
    // blocked on a human is what the WAITING group exists to show.
    const { candidates: picked } = selectCandidates(
      [
        {
          sessionId: 'waiting',
          updatedAt: new Date(NOW - 5 * DAY).toISOString(),
        },
      ],
      opts,
    );

    expect(picked.map(s => s.sessionId)).toEqual(['waiting']);
  });

  it('keeps a session with no usable timestamp, sorted last', () => {
    // `normalizeTimestamp` has already rejected Go zero time and anything
    // unparseable, so an absent value means "cannot tell" — not "old". Dropping
    // it would hide a session on the strength of a field kagent need not send.
    const { candidates: picked } = selectCandidates(
      [
        { sessionId: 'unknown' },
        { sessionId: 'dated', updatedAt: '2026-09-04T10:00:00Z' },
      ],
      opts,
    );

    expect(picked.map(s => s.sessionId)).toEqual(['dated', 'unknown']);
  });
});
