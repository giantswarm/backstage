import { renderHook } from '@testing-library/react';
import { useAgentAvatarUrl } from './useAgentAvatarUrl';

let mockInstallations: { name: string; baseDomain?: string }[] = [];

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallations: () => ({
    installations: mockInstallations,
    isLoading: false,
  }),
}));

describe('useAgentAvatarUrl', () => {
  beforeEach(() => {
    mockInstallations = [
      { name: 'graveler', baseDomain: 'graveler.gaws2.gigantic.io' },
      { name: 'no-domain' },
    ];
  });

  it('builds the canonical URL for a known installation', () => {
    const { result } = renderHook(() => useAgentAvatarUrl());

    expect(result.current('graveler', 'go-developer', { size: 48 })).toBe(
      'https://avatars.graveler.gaws2.gigantic.io/v1/48/go-developer.png',
    );
  });

  it('returns undefined for an unknown installation', () => {
    const { result } = renderHook(() => useAgentAvatarUrl());

    expect(
      result.current('nope', 'go-developer', { size: 48 }),
    ).toBeUndefined();
  });

  it('returns undefined when the installation has no base domain', () => {
    const { result } = renderHook(() => useAgentAvatarUrl());

    expect(result.current('no-domain', 'go-developer')).toBeUndefined();
  });

  it('returns undefined for an empty name', () => {
    const { result } = renderHook(() => useAgentAvatarUrl());

    expect(result.current('graveler', '')).toBeUndefined();
  });
});
