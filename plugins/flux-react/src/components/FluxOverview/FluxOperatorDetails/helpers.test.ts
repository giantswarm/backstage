import {
  FluxInstance,
  FluxReport,
  ResourceSet,
  ResourceSetInputProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  findFluxInstance,
  findFluxReport,
  findInputProviders,
  findResourceSetsUsingProvider,
} from './helpers';

function create<T>(
  ResourceClass: new (json: any, cluster: string) => T,
  kind: string,
  options: {
    name: string;
    namespace?: string;
    cluster?: string;
    labels?: Record<string, string>;
    spec?: Record<string, unknown>;
  },
): T {
  return new ResourceClass(
    {
      apiVersion: 'fluxcd.controlplane.io/v1',
      kind,
      metadata: {
        name: options.name,
        namespace: options.namespace ?? 'tenant-a',
        labels: options.labels,
      },
      spec: options.spec ?? {},
    },
    options.cluster ?? 'test-installation',
  );
}

const provider = (
  name: string,
  options: {
    labels?: Record<string, string>;
    namespace?: string;
    cluster?: string;
  } = {},
) =>
  create(ResourceSetInputProvider, 'ResourceSetInputProvider', {
    name,
    ...options,
  });

describe('input provider relationships', () => {
  const branches = provider('branches', { labels: { team: 'a' } });
  const tags = provider('tags', { labels: { team: 'b' } });
  const otherNamespace = provider('branches', {
    namespace: 'tenant-b',
    labels: { team: 'a' },
  });
  const otherCluster = provider('branches', {
    cluster: 'other-installation',
    labels: { team: 'a' },
  });
  const allProviders = [branches, tags, otherNamespace, otherCluster];

  const byName = create(ResourceSet, 'ResourceSet', {
    name: 'by-name',
    spec: { inputsFrom: [{ name: 'branches' }] },
  });
  const bySelector = create(ResourceSet, 'ResourceSet', {
    name: 'by-selector',
    spec: { inputsFrom: [{ selector: { matchLabels: { team: 'b' } } }] },
  });

  it('finds the providers a ResourceSet names, in its cluster and namespace', () => {
    expect(findInputProviders(byName, allProviders)).toEqual([branches]);
  });

  it('finds the providers a ResourceSet selects by label', () => {
    expect(findInputProviders(bySelector, allProviders)).toEqual([tags]);
  });

  it('finds the ResourceSets that use a provider', () => {
    const resourceSets = [byName, bySelector];

    expect(findResourceSetsUsingProvider(branches, resourceSets)).toEqual([
      byName,
    ]);
    expect(findResourceSetsUsingProvider(tags, resourceSets)).toEqual([
      bySelector,
    ]);
    expect(findResourceSetsUsingProvider(otherNamespace, resourceSets)).toEqual(
      [],
    );
    expect(findResourceSetsUsingProvider(otherCluster, resourceSets)).toEqual(
      [],
    );
  });
});

describe('FluxInstance and FluxReport', () => {
  it('pairs them by cluster and namespace', () => {
    const instance = create(FluxInstance, 'FluxInstance', {
      name: 'flux',
      namespace: 'flux-system',
    });
    const report = create(FluxReport, 'FluxReport', {
      name: 'flux',
      namespace: 'flux-system',
    });
    const elsewhere = create(FluxReport, 'FluxReport', {
      name: 'flux',
      namespace: 'flux-system',
      cluster: 'other-installation',
    });

    expect(findFluxReport(instance, [elsewhere, report])).toBe(report);
    expect(findFluxInstance(report, [instance])).toBe(instance);
    expect(findFluxInstance(elsewhere, [instance])).toBeUndefined();
  });
});
