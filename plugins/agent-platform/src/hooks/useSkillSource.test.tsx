import { renderHook } from '@testing-library/react';
import { useHomeInstallation } from '@giantswarm/backstage-plugin-gs';
import { useMusterPluginApi } from './useMusterPluginApi';
import { useMusterServerAvailability } from '@giantswarm/backstage-plugin-muster';
import { useSkillSource } from './useSkillSource';

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useHomeInstallation: jest.fn(),
}));
jest.mock('./useMusterPluginApi', () => ({ useMusterPluginApi: jest.fn() }));
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-muster'),
  useMusterServerAvailability: jest.fn(),
}));

const musterApi = { callTool: jest.fn() };

function given(options: {
  home?: string;
  homeLoading?: boolean;
  presence?: Record<string, string>;
  availabilityLoading?: boolean;
  failed?: string[];
}) {
  jest.mocked(useMusterPluginApi).mockReturnValue(musterApi as never);
  jest.mocked(useHomeInstallation).mockReturnValue({
    home: options.home ? ({ name: options.home } as never) : undefined,
    isLoading: Boolean(options.homeLoading),
  });
  jest.mocked(useMusterServerAvailability).mockReturnValue({
    presenceOf: (installation: string) =>
      options.presence?.[installation] ?? 'unknown',
    isLoading: Boolean(options.availabilityLoading),
    failedOf: (installation: string) =>
      (options.failed ?? []).includes(installation),
  } as never);
}

describe('useSkillSource', () => {
  it('reads the given installation’s skill-manager where muster lists it', () => {
    given({ home: 'gazelle', presence: { graveler: 'available' } });
    const { result } = renderHook(() => useSkillSource('graveler'));
    expect(result.current).toMatchObject({
      kind: 'skill-manager',
      installation: 'graveler',
    });
    expect(useMusterServerAvailability).toHaveBeenCalledWith('skill-manager', [
      'graveler',
    ]);
  });

  it('falls back to the home installation without one', () => {
    given({ home: 'gazelle', presence: { gazelle: 'available' } });
    const { result } = renderHook(() => useSkillSource());
    expect(result.current).toMatchObject({
      kind: 'skill-manager',
      installation: 'gazelle',
    });
  });

  it('reads the portal’s own discovery where skill-manager is missing', () => {
    given({ home: 'gazelle', presence: { gazelle: 'missing' } });
    expect(renderHook(() => useSkillSource()).result.current).toEqual({
      kind: 'portal',
    });
  });

  it('reads the portal’s own discovery where muster has no per-person sign-in', () => {
    given({ home: 'gazelle', presence: { gazelle: 'sharedIdentity' } });
    expect(renderHook(() => useSkillSource()).result.current).toEqual({
      kind: 'portal',
    });
  });

  it('waits between two reads: unknown and not loading, but nothing failed', () => {
    given({ home: 'gazelle', presence: { gazelle: 'unknown' } });
    expect(renderHook(() => useSkillSource()).result.current).toEqual({
      kind: 'pending',
    });
  });

  it('is unreachable, not the portal’s own discovery, when muster’s server list failed', () => {
    given({
      home: 'gazelle',
      presence: { gazelle: 'unknown' },
      failed: ['gazelle'],
    });
    expect(renderHook(() => useSkillSource()).result.current).toEqual({
      kind: 'unreachable',
      installation: 'gazelle',
    });
  });

  it('reads the portal’s own discovery without the muster plugin', () => {
    given({ home: 'gazelle', presence: { gazelle: 'unknown' } });
    jest.mocked(useMusterPluginApi).mockReturnValue(undefined);
    expect(renderHook(() => useSkillSource()).result.current).toEqual({
      kind: 'portal',
    });
  });

  it('waits while the server list or the home installation is read', () => {
    given({ home: 'gazelle', availabilityLoading: true });
    expect(renderHook(() => useSkillSource()).result.current).toEqual({
      kind: 'pending',
    });
    given({ homeLoading: true });
    expect(renderHook(() => useSkillSource()).result.current).toEqual({
      kind: 'pending',
    });
  });
});
