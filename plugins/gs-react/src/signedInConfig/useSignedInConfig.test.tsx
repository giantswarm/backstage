import { ConfigReader } from '@backstage/config';
import { act, renderHook } from '@testing-library/react';
import {
  __resetSignedInConfigForTests,
  setSignedInConfig,
} from './signedInConfig';
import { useSignedInConfig } from './useSignedInConfig';

describe('useSignedInConfig', () => {
  beforeEach(() => {
    __resetSignedInConfigForTests();
  });

  it('is loading until the config is published, then re-renders with it', () => {
    const { result } = renderHook(() => useSignedInConfig());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.config).toBeUndefined();

    act(() => {
      setSignedInConfig(new ConfigReader({ gs: { adminGroups: ['admins'] } }));
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.config?.getStringArray('gs.adminGroups')).toEqual([
      'admins',
    ]);
  });

  it('reads a config published before the first render', () => {
    setSignedInConfig(new ConfigReader({ flux: {} }));

    const { result } = renderHook(() => useSignedInConfig());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.config?.has('flux')).toBe(true);
  });
});
