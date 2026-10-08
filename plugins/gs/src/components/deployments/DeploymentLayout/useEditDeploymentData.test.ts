import { renderHook } from '@testing-library/react';
import {
  HelmRelease,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useEditDeploymentData } from './useEditDeploymentData';

let ociRepository: OCIRepository | undefined;

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => {
  const actual = jest.requireActual(
    '@giantswarm/backstage-plugin-kubernetes-react',
  );
  return {
    ...actual,
    useResource: () => ({
      resource: ociRepository,
      isLoading: false,
      error: null,
    }),
  };
});

const INSTALLATION = 'installation-a';

const deployment = new HelmRelease(
  {
    apiVersion: 'helm.toolkit.fluxcd.io/v2',
    kind: 'HelmRelease',
    metadata: { name: 'my-app', namespace: 'org-a' },
    spec: { chartRef: { kind: 'OCIRepository', name: 'my-app' } },
  } as any,
  INSTALLATION,
);

function oci(ref: Record<string, string>, revision?: string) {
  return new OCIRepository(
    {
      apiVersion: 'source.toolkit.fluxcd.io/v1',
      kind: 'OCIRepository',
      metadata: { name: 'my-app', namespace: 'org-a' },
      spec: { url: 'oci://gsoci.azurecr.io/charts/my-app', ref },
      status: revision ? { artifact: { revision } } : undefined,
    } as any,
    INSTALLATION,
  );
}

describe('useEditDeploymentData', () => {
  it('carries the semver filter and the pre-release range to the edit form', () => {
    ociRepository = oci(
      { semver: '>=0.0.0-0', semverFilter: '.*-rc\\..*' },
      '1.3.0-rc.1@sha256:abc',
    );

    const { result } = renderHook(() =>
      useEditDeploymentData(deployment, INSTALLATION),
    );

    expect(result.current).toMatchObject({
      chartRef: 'gsoci.azurecr.io/charts/my-app',
      chartTag: '1.3.0-rc.1',
      autoUpgrades: {
        mode: 'major-upgrades',
        semverFilter: '.*-rc\\..*',
        includePrereleases: true,
      },
    });
  });

  it('reports a pinned tag without filter or pre-releases', () => {
    ociRepository = oci({ tag: '1.2.3' });

    const { result } = renderHook(() =>
      useEditDeploymentData(deployment, INSTALLATION),
    );

    expect(result.current.autoUpgrades).toEqual({
      mode: 'no-upgrades',
      semverFilter: undefined,
      includePrereleases: false,
    });
  });
});
