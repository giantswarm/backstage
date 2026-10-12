import { act, renderHook } from '@testing-library/react';

import {
  useBeforeDeadline,
  useDeadlinePassed,
  useWatchStartedAt,
} from './useDeadlinePassed';

const NOW = Date.parse('2026-07-31T12:00:00Z');

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useDeadlinePassed', () => {
  it('turns true when the deadline passes, on its own', () => {
    const { result } = renderHook(() => useDeadlinePassed(NOW + 1_000));
    expect(result.current).toBe(false);

    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(result.current).toBe(true);
  });

  // Timers run on a monotonic clock, Date.now() on the wall clock: one set
  // back (or coarsened) reads just short of the deadline when the timer fires.
  it('counts a timer that fires before the wall clock reaches the deadline', () => {
    const { result } = renderHook(() => useDeadlinePassed(NOW + 1_000));

    jest.setSystemTime(NOW - 500);
    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(Date.now()).toBeLessThan(NOW + 1_000);
    expect(result.current).toBe(true);
  });

  it('starts a new deadline not passed, on its first render', () => {
    const { result, rerender } = renderHook(
      ({ until }) => useDeadlinePassed(until),
      { initialProps: { until: NOW + 1_000 } },
    );
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(true);

    rerender({ until: Date.now() + 1_000 });

    expect(result.current).toBe(false);
  });

  it('is false without a deadline', () => {
    const { result } = renderHook(() => useDeadlinePassed(undefined));
    expect(result.current).toBe(false);
  });
});

describe('useWatchStartedAt', () => {
  it('keeps the start of a watch while it is off, and restarts for another', () => {
    const { result, rerender } = renderHook(
      ({ watch }: { watch: string | undefined }) => useWatchStartedAt(watch),
      { initialProps: { watch: 'a' as string | undefined } },
    );
    expect(result.current).toBe(NOW);

    jest.setSystemTime(NOW + 60_000);
    rerender({ watch: undefined });
    expect(result.current).toBeUndefined();
    rerender({ watch: 'a' });
    expect(result.current).toBe(NOW);

    rerender({ watch: 'b' });
    expect(result.current).toBe(NOW + 60_000);
  });
});

describe('useBeforeDeadline', () => {
  it('is true until the deadline, and false without one', () => {
    const { result } = renderHook(() => useBeforeDeadline(NOW + 1_000));
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(result.current).toBe(false);
    expect(renderHook(() => useBeforeDeadline(undefined)).result.current).toBe(
      false,
    );
  });
});
