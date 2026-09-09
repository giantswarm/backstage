import { renderHook } from '@testing-library/react';
import { DEFAULT_SYSTEM_MESSAGE, useAgentChart } from './useAgentChart';

describe('useAgentChart', () => {
  it('answers the v1alpha3 API and the built-in default prompt without loading anything', () => {
    const { result } = renderHook(() => useAgentChart());

    expect(result.current).toEqual({
      version: 'kagent.dev/v1alpha3',
      defaultSystemMessage: DEFAULT_SYSTEM_MESSAGE,
      isLoading: false,
      error: null,
    });
    expect(DEFAULT_SYSTEM_MESSAGE.trim().length).toBeGreaterThan(0);
  });

  it('is stable across renders, so the create form seeds its prompt exactly once', () => {
    const { result, rerender } = renderHook(() => useAgentChart());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
