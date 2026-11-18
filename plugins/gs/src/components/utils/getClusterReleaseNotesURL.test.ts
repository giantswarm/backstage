import { releaseProviderOfApp } from '../clusters/utils';
import { getClusterReleaseNotesURL } from './helpers';

describe('getClusterReleaseNotesURL', () => {
  it.each([
    ['aws', '31.1.0', 'aws/v31.1.0'],
    ['azure', 'v30.0.1', 'azure/v30.0.1'],
  ])('links %s %s to the release tagged %s', (provider, version, tag) => {
    expect(getClusterReleaseNotesURL(provider, version)).toBe(
      `https://github.com/giantswarm/releases/releases/tag/${tag}`,
    );
  });
});

describe('releaseProviderOfApp', () => {
  it.each([
    ['cluster-aws', 'aws'],
    ['cluster-aks', 'aks'],
    ['cluster-eks', 'eks'],
    ['cluster-cloud-director', 'cloud-director'],
  ])('reads %s as %s', (app, provider) => {
    expect(releaseProviderOfApp(app)).toBe(provider);
  });

  it('has none for a cluster app outside the naming', () => {
    expect(releaseProviderOfApp(undefined)).toBeUndefined();
    expect(releaseProviderOfApp('my-cluster')).toBeUndefined();
    expect(releaseProviderOfApp('cluster-AWS')).toBeUndefined();
  });
});
