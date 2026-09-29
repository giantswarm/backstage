import { renderHook } from '@testing-library/react';
import { useAgentIconUrl } from './useAgentIconUrl';

let mockInstallations: { name: string; baseDomain?: string }[] = [];

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallations: () => ({
    installations: mockInstallations,
    isLoading: false,
  }),
}));

describe('useAgentIconUrl', () => {
  beforeEach(() => {
    mockInstallations = [
      { name: 'graveler', baseDomain: 'graveler.gaws2.gigantic.io' },
      { name: 'no-domain' },
    ];
  });

  it('builds the canonical, size-agnostic URL on the installation’s own host', () => {
    const { result } = renderHook(() => useAgentIconUrl());

    expect(result.current('graveler', 'go-developer')).toBe(
      'https://avatars.graveler.gaws2.gigantic.io/v1/go-developer.png',
    );
  });

  it('returns undefined for an unknown installation', () => {
    const { result } = renderHook(() => useAgentIconUrl());

    expect(result.current('nope', 'go-developer')).toBeUndefined();
  });

  it('returns undefined when the installation has no base domain', () => {
    const { result } = renderHook(() => useAgentIconUrl());

    expect(result.current('no-domain', 'go-developer')).toBeUndefined();
  });

  it('returns undefined for an empty name', () => {
    const { result } = renderHook(() => useAgentIconUrl());

    expect(result.current('graveler', '')).toBeUndefined();
  });
});
