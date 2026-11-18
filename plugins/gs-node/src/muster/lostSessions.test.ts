import {
  FREQUENT_LOST_SESSIONS,
  FREQUENT_LOST_SESSIONS_WINDOW_MS,
  LostSessionTracker,
} from './lostSessions';

describe('LostSessionTracker', () => {
  const clients = (count: number) => Array.from({ length: count }, () => ({}));

  it('is due a warning on the tenth loss within the window, and not again in it', () => {
    const tracker = new LostSessionTracker();
    const due = clients(FREQUENT_LOST_SESSIONS * 2).map((client, i) =>
      tracker.note('gazelle', client, i * 1000),
    );

    expect(due.indexOf(true)).toBe(FREQUENT_LOST_SESSIONS - 1);
    expect(due.filter(Boolean)).toHaveLength(1);
  });

  it('is due again once a window has passed since the last warning', () => {
    const tracker = new LostSessionTracker();
    for (const client of clients(FREQUENT_LOST_SESSIONS)) {
      tracker.note('gazelle', client, 0);
    }
    const later = clients(FREQUENT_LOST_SESSIONS).map(client =>
      tracker.note('gazelle', client, FREQUENT_LOST_SESSIONS_WINDOW_MS),
    );

    expect(later.filter(Boolean)).toHaveLength(1);
  });

  it('counts a client once', () => {
    const tracker = new LostSessionTracker();
    const client = {};
    const due = Array.from({ length: FREQUENT_LOST_SESSIONS * 2 }, () =>
      tracker.note('gazelle', client, 0),
    );

    expect(due.some(Boolean)).toBe(false);
  });

  it('is not due when the losses are spread wider than the window', () => {
    const tracker = new LostSessionTracker();
    const spacing =
      FREQUENT_LOST_SESSIONS_WINDOW_MS / (FREQUENT_LOST_SESSIONS - 1) + 1;
    const due = clients(FREQUENT_LOST_SESSIONS * 3).map((client, i) =>
      tracker.note('gazelle', client, i * spacing),
    );

    expect(due.some(Boolean)).toBe(false);
  });

  it('keeps installations apart', () => {
    const tracker = new LostSessionTracker();
    const due = clients(FREQUENT_LOST_SESSIONS * 2).map((client, i) =>
      tracker.note(i % 2 === 0 ? 'gazelle' : 'golem', client, 0),
    );

    expect(due.filter(Boolean)).toHaveLength(2);
  });
});
