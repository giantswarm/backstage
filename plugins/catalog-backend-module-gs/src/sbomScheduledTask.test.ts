import { extractGiantSwarmDependencies } from './sbomScheduledTask';

describe('extractGiantSwarmDependencies', () => {
  it('extracts giantswarm Go dependencies from SBOM', () => {
    const data = {
      sbom: {
        packages: [
          {
            name: 'github.com/giantswarm/microerror',
            externalRefs: [
              {
                referenceCategory: 'PACKAGE-MANAGER',
                referenceLocator:
                  'pkg:golang/github.com/giantswarm/microerror@0.4.1',
                referenceType: 'purl',
              },
            ],
          },
          {
            name: 'github.com/giantswarm/k8smetadata',
            externalRefs: [
              {
                referenceCategory: 'PACKAGE-MANAGER',
                referenceLocator:
                  'pkg:golang/github.com/giantswarm/k8smetadata@0.24.0',
                referenceType: 'purl',
              },
            ],
          },
        ],
      },
    };

    const result = extractGiantSwarmDependencies(data);
    expect(result).toEqual(['microerror', 'k8smetadata']);
  });

  it('ignores non-giantswarm dependencies', () => {
    const data = {
      sbom: {
        packages: [
          {
            name: 'github.com/prometheus/client_golang',
            externalRefs: [
              {
                referenceCategory: 'PACKAGE-MANAGER',
                referenceLocator:
                  'pkg:golang/github.com/prometheus/client_golang@1.14.0',
                referenceType: 'purl',
              },
            ],
          },
        ],
      },
    };

    const result = extractGiantSwarmDependencies(data);
    expect(result).toEqual([]);
  });

  it('ignores non-purl external refs', () => {
    const data = {
      sbom: {
        packages: [
          {
            name: 'github.com/giantswarm/microerror',
            externalRefs: [
              {
                referenceCategory: 'OTHER',
                referenceLocator: 'https://github.com/giantswarm/microerror',
                referenceType: 'url',
              },
            ],
          },
        ],
      },
    };

    const result = extractGiantSwarmDependencies(data);
    expect(result).toEqual([]);
  });

  it('deduplicates dependencies', () => {
    const data = {
      sbom: {
        packages: [
          {
            name: 'github.com/giantswarm/microerror',
            externalRefs: [
              {
                referenceCategory: 'PACKAGE-MANAGER',
                referenceLocator:
                  'pkg:golang/github.com/giantswarm/microerror@0.4.1',
                referenceType: 'purl',
              },
            ],
          },
          {
            name: 'github.com/giantswarm/microerror',
            externalRefs: [
              {
                referenceCategory: 'PACKAGE-MANAGER',
                referenceLocator:
                  'pkg:golang/github.com/giantswarm/microerror@0.4.2',
                referenceType: 'purl',
              },
            ],
          },
        ],
      },
    };

    const result = extractGiantSwarmDependencies(data);
    expect(result).toEqual(['microerror']);
  });

  it('handles packages with empty externalRefs', () => {
    const data = {
      sbom: {
        packages: [
          {
            name: 'github.com/giantswarm/something',
            externalRefs: [],
          },
        ],
      },
    };

    const result = extractGiantSwarmDependencies(data);
    expect(result).toEqual([]);
  });

  it('handles empty packages list', () => {
    const data = {
      sbom: {
        packages: [],
      },
    };

    const result = extractGiantSwarmDependencies(data);
    expect(result).toEqual([]);
  });

  it('ignores non-golang purls', () => {
    const data = {
      sbom: {
        packages: [
          {
            name: '@giantswarm/some-npm-package',
            externalRefs: [
              {
                referenceCategory: 'PACKAGE-MANAGER',
                referenceLocator:
                  'pkg:npm/%40giantswarm/some-npm-package@1.0.0',
                referenceType: 'purl',
              },
            ],
          },
        ],
      },
    };

    const result = extractGiantSwarmDependencies(data);
    expect(result).toEqual([]);
  });
});
