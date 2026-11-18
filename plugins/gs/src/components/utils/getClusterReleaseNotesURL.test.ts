import { getClusterReleaseNotesURL } from './helpers';

describe('getClusterReleaseNotesURL', () => {
  it.each([
    ['cluster-aws', '31.1.0', 'aws/v31.1.0'],
    ['cluster-azure', 'v30.0.1', 'azure/v30.0.1'],
    ['cluster-aks', '36.2.0', 'aks/v36.2.0'],
    ['cluster-cloud-director', '30.1.0', 'cloud-director/v30.1.0'],
  ])('links %s %s to the release tagged %s', (app, version, tag) => {
    expect(getClusterReleaseNotesURL(app, version)).toBe(
      `https://github.com/giantswarm/releases/releases/tag/${tag}`,
    );
  });

  it('has none for a cluster app outside the naming', () => {
    expect(getClusterReleaseNotesURL(undefined, '31.1.0')).toBeUndefined();
    expect(getClusterReleaseNotesURL('my-cluster', '31.1.0')).toBeUndefined();
  });
});
