import { PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { configApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { useAgentAvatarUrl } from './useAgentAvatarUrl';

let mockInstallations: { name: string; baseDomain?: string }[] = [];

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallations: () => ({
    installations: mockInstallations,
    isLoading: false,
  }),
}));

const configApi = mockApis.config({
  data: { backend: { baseUrl: 'https://portal.example/' } },
});

const wrapper = ({ children }: PropsWithChildren<{}>) => (
  <TestApiProvider apis={[[configApiRef, configApi]]}>
    {children}
  </TestApiProvider>
);

describe('useAgentAvatarUrl', () => {
  beforeEach(() => {
    mockInstallations = [
      { name: 'graveler', baseDomain: 'graveler.gaws2.gigantic.io' },
      { name: 'no-domain' },
    ];
  });

  it('builds the backend-proxied URL for a known installation', () => {
    const { result } = renderHook(() => useAgentAvatarUrl(), { wrapper });

    expect(result.current('graveler', 'go-developer', { size: 48 })).toBe(
      'https://portal.example/api/agent-platform/avatars/graveler/v1/48/go-developer.png',
    );
  });

  it('keeps the preview route', () => {
    const { result } = renderHook(() => useAgentAvatarUrl(), { wrapper });

    expect(
      result.current('graveler', 'go-developer', { size: 128, preview: true }),
    ).toBe(
      'https://portal.example/api/agent-platform/avatars/graveler/v1/preview/128/go-developer.png',
    );
  });

  it('never names the installation’s host', () => {
    const { result } = renderHook(() => useAgentAvatarUrl(), { wrapper });

    expect(result.current('graveler', 'go-developer')).not.toMatch(
      /gigantic\.io|avatars\./,
    );
  });

  it('returns undefined for an unknown installation', () => {
    const { result } = renderHook(() => useAgentAvatarUrl(), { wrapper });

    expect(
      result.current('nope', 'go-developer', { size: 48 }),
    ).toBeUndefined();
  });

  it('returns undefined when the installation has no base domain, as the backend cannot proxy it', () => {
    const { result } = renderHook(() => useAgentAvatarUrl(), { wrapper });

    expect(result.current('no-domain', 'go-developer')).toBeUndefined();
  });

  it('returns undefined for an empty name', () => {
    const { result } = renderHook(() => useAgentAvatarUrl(), { wrapper });

    expect(result.current('graveler', '')).toBeUndefined();
  });
});
