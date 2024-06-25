import { parseClusterRef } from './parseClusterRef';

describe('parseClusterRef', () => {
  it('handles correct refs', () => {
    expect(parseClusterRef('installation/cluster-name')).toEqual({
      installationName: 'installation',
      clusterName: 'cluster-name',
    });
    expect(parseClusterRef('inst321/cluster123')).toEqual({
      installationName: 'inst321',
      clusterName: 'cluster123',
    });
  });

  it('rejects bad installation names', () => {
    expect(() => parseClusterRef('badInstallation/cluster-name')).toThrow();
    expect(() => parseClusterRef('bad-installation/cluster-name')).toThrow();
    expect(() => parseClusterRef('bad installation/cluster-name')).toThrow();
    expect(() => parseClusterRef('bad/installation/cluster-name')).toThrow();
  });

  it('rejects bad cluster names', () => {
    expect(() => parseClusterRef('installation/clusterName')).toThrow();
    expect(() => parseClusterRef('installation/cluster.name')).toThrow();
    expect(() => parseClusterRef('installation/cluster/name')).toThrow();
    expect(() => parseClusterRef('installation/123cluster')).toThrow();
  });

  it('rejects if installation or cluster names are missing', () => {
    expect(() => parseClusterRef('installation')).toThrow();
    expect(() => parseClusterRef('cluster-name')).toThrow();
    expect(() => parseClusterRef('')).toThrow();
  });
});
