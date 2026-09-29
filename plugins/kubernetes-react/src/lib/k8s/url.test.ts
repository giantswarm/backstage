import {
  clusterLocalServiceUrl,
  isClusterLocalHostname,
  urlHostname,
} from './url';

describe('urlHostname', () => {
  it('lower-cases the host and ignores scheme, port and path', () => {
    expect(urlHostname('HTTPS://Qwen3-14B.Models.Example.test:8443/v1')).toBe(
      'qwen3-14b.models.example.test',
    );
  });

  it('is undefined for empty or non-URL values', () => {
    expect(urlHostname(undefined)).toBeUndefined();
    expect(urlHostname('')).toBeUndefined();
    expect(urlHostname('not a url')).toBeUndefined();
  });
});

describe('isClusterLocalHostname', () => {
  it('recognises Service DNS names in every form', () => {
    expect(isClusterLocalHostname('svc.ns.svc')).toBe(true);
    expect(isClusterLocalHostname('svc.ns.svc.cluster.local')).toBe(true);
    expect(isClusterLocalHostname('Svc.NS.SVC.Cluster.Local')).toBe(true);
  });

  it('leaves external hosts alone', () => {
    expect(isClusterLocalHostname('models.example.test')).toBe(false);
    expect(isClusterLocalHostname('svc.ns')).toBe(false);
  });
});

describe('clusterLocalServiceUrl', () => {
  it('turns https into http for Service DNS names without an explicit port', () => {
    expect(
      clusterLocalServiceUrl('https://qwen3-kserve-workload-svc.kserve.svc'),
    ).toBe('http://qwen3-kserve-workload-svc.kserve.svc');
    expect(
      clusterLocalServiceUrl(
        'https://qwen3-kserve-workload-svc.kserve.svc.cluster.local/v1',
      ),
    ).toBe('http://qwen3-kserve-workload-svc.kserve.svc.cluster.local/v1');
  });

  it('keeps external hosts, explicit ports and http URLs as published', () => {
    expect(
      clusterLocalServiceUrl('https://models.example.test/kserve/qwen3'),
    ).toBe('https://models.example.test/kserve/qwen3');
    expect(
      clusterLocalServiceUrl('https://svc.ns.svc.cluster.local:8443'),
    ).toBe('https://svc.ns.svc.cluster.local:8443');
    expect(clusterLocalServiceUrl('http://svc.ns.svc')).toBe(
      'http://svc.ns.svc',
    );
  });
});
