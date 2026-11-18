import { Release } from '@giantswarm/backstage-plugin-kubernetes-react';
import { newerReleaseOf } from './useNewerRelease';

function release(
  name: string,
  state = 'active',
  date = '2026-09-18T00:00:00Z',
) {
  return new Release(
    {
      apiVersion: 'release.giantswarm.io/v1alpha1',
      kind: 'Release',
      metadata: { name },
      spec: { apps: [], components: [], date, state },
    } as any,
    'meadow',
  );
}

describe('newerReleaseOf', () => {
  it('finds the newest active release of the provider newer than the current one', () => {
    expect(
      newerReleaseOf(
        [
          release('aws-31.1.0'),
          release('aws-32.0.0'),
          release('aws-33.0.0', 'deprecated'),
          release('azure-34.0.0'),
        ],
        'aws',
        '31.1.0',
      ),
    ).toEqual({ version: '32.0.0', date: '2026-09-18T00:00:00Z' });
  });

  it.each([
    ['eks', ['eks-31.0.0', 'eks-32.0.0']],
    ['cloud-director', ['cloud-director-31.0.0', 'cloud-director-32.0.0']],
  ])('reads the version off a %s release’s name', (provider, names) => {
    expect(
      newerReleaseOf(
        names.map(name => release(name)),
        provider,
        '31.0.0',
      )?.version,
    ).toBe('32.0.0');
  });

  it('has none where the cluster runs the newest', () => {
    expect(
      newerReleaseOf([release('aws-31.1.0')], 'aws', '31.1.0'),
    ).toBeUndefined();
  });
});
