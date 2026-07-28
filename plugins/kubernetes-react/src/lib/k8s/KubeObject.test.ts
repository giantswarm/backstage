import { ConfigMap } from './ConfigMap';
import { Kustomization } from './Kustomization';

describe('KubeObject.getResolvedGVK', () => {
  it('reports the group and version a custom resource was read at', () => {
    const resource = new Kustomization(
      {
        apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
        kind: 'Kustomization',
        metadata: { name: 'my-app', namespace: 'flux-system' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      'test-installation',
    );

    expect(resource.getResolvedGVK()).toEqual({
      group: 'kustomize.toolkit.fluxcd.io',
      apiVersion: 'v1',
      plural: 'kustomizations',
      isCore: false,
    });
  });

  it('prefers the version on the object over the class default', () => {
    // The class supports v1 too, but discovery may have resolved v1beta2 for
    // this cluster — writes and invalidations must follow the object.
    const resource = new Kustomization(
      {
        apiVersion: 'kustomize.toolkit.fluxcd.io/v1beta2',
        kind: 'Kustomization',
        metadata: { name: 'my-app', namespace: 'flux-system' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      'test-installation',
    );

    expect(resource.getResolvedGVK().apiVersion).toBe('v1beta2');
  });

  it('reports an empty group for a core resource', () => {
    // `getGroup()` splits apiVersion on '/', so it returns 'v1' here — an empty
    // group is what the read hooks key on and what an access review needs.
    const resource = new ConfigMap(
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: 'my-config', namespace: 'flux-system' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      'test-installation',
    );

    expect(resource.getResolvedGVK()).toEqual({
      group: '',
      apiVersion: 'v1',
      plural: 'configmaps',
      isCore: true,
    });
  });

  it('produces a group that drops out of a read query key for a core resource', () => {
    // `useListResources` builds ['cluster', c, 'list', group, apiVersion, plural]
    // and calls `.filter(Boolean)`; an invalidation built from getResolvedGVK()
    // has to collapse the same way or it matches nothing.
    const resource = new ConfigMap(
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: 'my-config' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      'test-installation',
    );

    const gvk = resource.getResolvedGVK();
    const key = [
      'cluster',
      'test-installation',
      'list',
      gvk.group,
      gvk.apiVersion,
      gvk.plural,
    ].filter(Boolean);

    expect(key).toEqual([
      'cluster',
      'test-installation',
      'list',
      'v1',
      'configmaps',
    ]);
  });
});
