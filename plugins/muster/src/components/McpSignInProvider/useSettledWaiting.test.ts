import {
  SETTLE_MIN_APART_MS,
  SETTLE_WINDOW_MS,
  settleWaiting,
  type SettleState,
  UNSETTLED,
} from './useSettledWaiting';

function reads(
  ...steps: Array<{ waiting: string[]; connecting?: boolean; at: number }>
): SettleState {
  return steps.reduce<SettleState>(
    (state, step) => settleWaiting(state, { connecting: false, ...step }),
    UNSETTLED,
  );
}

describe('settleWaiting', () => {
  it('raises a waiting set once two reads far enough apart agree', () => {
    expect(reads({ waiting: ['a'], at: 0 }).settled).toEqual([]);
    expect(
      reads({ waiting: ['a'], at: 0 }, { waiting: ['a'], at: 5_000 }).settled,
    ).toEqual(['a']);
  });

  it('does not count a re-read a moment after the first', () => {
    expect(
      reads(
        { waiting: ['a'], at: 0 },
        { waiting: ['a'], at: SETTLE_MIN_APART_MS - 1 },
      ).settled,
    ).toEqual([]);
  });

  it('starts over when the waiting set changes between reads', () => {
    expect(
      reads({ waiting: ['a'], at: 0 }, { waiting: ['a', 'b'], at: 5_000 })
        .settled,
    ).toEqual([]);
  });

  it('lets a server that stops waiting go at once', () => {
    const settled = reads(
      { waiting: ['a', 'b'], at: 0 },
      { waiting: ['a', 'b'], at: 5_000 },
    );
    expect(
      settleWaiting(settled, { waiting: ['b'], connecting: true, at: 6_000 })
        .settled,
    ).toEqual(['b']);
  });

  it('holds new servers back while muster is connecting, within the window', () => {
    const held = reads(
      { waiting: ['a'], connecting: true, at: 0 },
      { waiting: ['a'], connecting: true, at: 5_000 },
    );
    expect(held.settled).toEqual([]);
    expect(held.unsettledSince).toBe(0);
  });

  it('stops holding back past the window, when two reads agree', () => {
    expect(
      reads(
        { waiting: ['a'], connecting: true, at: 0 },
        { waiting: ['a'], connecting: true, at: SETTLE_WINDOW_MS },
        { waiting: ['a'], connecting: true, at: SETTLE_WINDOW_MS + 5_000 },
      ).settled,
    ).toEqual(['a']);
  });

  it('is settled, with nothing to re-read, while nothing waits', () => {
    expect(reads({ waiting: [], at: 0 })).toEqual({ settled: [] });
  });
});
