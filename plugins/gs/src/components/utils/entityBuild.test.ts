import type { Entity } from '@backstage/catalog-model';
import {
  getBuildFailingChecksFromEntity,
  getBuildStatusFromEntity,
  getBuildToolchainFromEntity,
  getDefaultBranchFromEntity,
  isEntityBuildStatusAvailable,
  isEntityBuildToolchainAvailable,
  isEntityReadinessAvailable,
} from './entity';

function entity(
  labels: Record<string, string> = {},
  annotations: Record<string, string> = {},
): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'my-app', labels, annotations },
  };
}

describe('build entity helpers', () => {
  it('gates the build column on the verdict label alone', () => {
    expect(
      isEntityBuildStatusAvailable(
        entity({ 'giantswarm.io/build-status': 'failing' }),
      ),
    ).toBe(true);
    // A toolchain without a verdict is what every repo looks like while the
    // processor is off. Nothing to put in a "Build" cell.
    expect(
      isEntityBuildStatusAvailable(
        entity({ 'giantswarm.io/architect-orb-version': '10.3.0' }),
      ),
    ).toBe(false);
  });

  it('gates the toolchain column on a release pin or a raw ref', () => {
    expect(
      isEntityBuildToolchainAvailable(
        entity({ 'giantswarm.io/architect-orb-version': '10.3.0' }),
      ),
    ).toBe(true);
    expect(
      isEntityBuildToolchainAvailable(
        entity({}, { 'giantswarm.io/architect-orb-ref': 'dev:abc123' }),
      ),
    ).toBe(true);
    expect(isEntityBuildToolchainAvailable(entity())).toBe(false);
  });

  it('shows the readiness card for a build verdict alone', () => {
    expect(
      isEntityReadinessAvailable(
        entity({ 'giantswarm.io/build-status': 'passing' }),
      ),
    ).toBe(true);
  });

  it('shows the readiness card for a declared toolchain alone', () => {
    // A repo with no chart, so no readiness-standards label, and the
    // processor off: the importer's orb labels are all there is.
    expect(
      isEntityReadinessAvailable(
        entity({ 'giantswarm.io/architect-orb-version': '10.3.0' }),
      ),
    ).toBe(true);
    expect(
      isEntityReadinessAvailable(
        entity({}, { 'giantswarm.io/architect-orb-ref': 'volatile' }),
      ),
    ).toBe(true);
  });

  it('reads the verdict, the failing checks and the branch', () => {
    const e = entity(
      { 'giantswarm.io/build-status': 'failing' },
      {
        'giantswarm.io/build-failing-checks': JSON.stringify([
          'ci/circleci: build',
          'test (ubuntu-latest, 20)',
        ]),
        'giantswarm.io/default-branch': 'main',
      },
    );
    expect(getBuildStatusFromEntity(e)).toBe('failing');
    expect(getBuildFailingChecksFromEntity(e)).toEqual([
      'ci/circleci: build',
      'test (ubuntu-latest, 20)',
    ]);
    expect(getDefaultBranchFromEntity(e)).toBe('main');
    expect(getBuildFailingChecksFromEntity(entity())).toEqual([]);
    // Not a JSON array: no checks rather than garbled ones.
    expect(
      getBuildFailingChecksFromEntity(
        entity({}, { 'giantswarm.io/build-failing-checks': 'build,lint' }),
      ),
    ).toEqual([]);
  });

  it('assembles the toolchain from the importer labels and annotations', () => {
    expect(
      getBuildToolchainFromEntity(
        entity(
          {
            'giantswarm.io/architect-orb-version': '10.3.0',
            'giantswarm.io/app-build-suite-version': '2.3.0',
            'giantswarm.io/app-test-suite-version': '0.15.0',
          },
          { 'giantswarm.io/app-test-suite-version-source': 'orb-default' },
        ),
      ),
    ).toEqual({
      orbVersion: '10.3.0',
      absVersion: '2.3.0',
      atsVersion: '0.15.0',
      atsSource: 'orb-default',
    });
  });

  it('carries a non-release pin as a ref, with no version', () => {
    expect(
      getBuildToolchainFromEntity(
        entity({}, { 'giantswarm.io/architect-orb-ref': 'dev:abc123' }),
      ),
    ).toEqual({ orbRef: 'dev:abc123' });
  });
});
