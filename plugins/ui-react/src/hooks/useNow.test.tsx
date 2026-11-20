import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { useNow } from './useNow';

describe('useNow', () => {
  beforeEach(() =>
    jest.useFakeTimers({ now: new Date('2026-10-25T00:00:00Z') }),
  );
  afterEach(() => jest.useRealTimers());

  it('keeps updating beyond 45 minutes and releases its timer in Strict Mode', () => {
    const { result, unmount } = renderHook(() => useNow(60_000), {
      wrapper: StrictMode,
    });
    act(() => jest.advanceTimersByTime(120 * 60_000));
    expect(result.current).toBe(Date.now());
    expect(jest.getTimerCount()).toBe(1);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not schedule while disabled and refreshes on enabling', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useNow(60_000, enabled),
      { initialProps: { enabled: false } },
    );
    expect(jest.getTimerCount()).toBe(0);
    act(() => jest.advanceTimersByTime(60_000));
    rerender({ enabled: true });
    expect(result.current).toBe(Date.now());
    rerender({ enabled: false });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('refreshes immediately when the tab becomes visible', () => {
    const { result } = renderHook(() => useNow(60_000));
    jest.setSystemTime(new Date('2026-10-25T03:00:00Z'));
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current).toBe(Date.now());
  });
});
