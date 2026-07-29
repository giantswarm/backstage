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

describe('KubeObject.getApplyFieldOwners', () => {
  function withManagedFields(
    managedFields: unknown[] | undefined,
  ): Kustomization {
    return new Kustomization(
      {
        apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
        kind: 'Kustomization',
        metadata: { name: 'my-app', namespace: 'flux-system', managedFields },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      'test-installation',
    );
  }

  const suspendFields = { 'f:spec': { 'f:suspend': {} } };

  it('returns nothing when the object has no managed fields', () => {
    expect(
      withManagedFields(undefined).getApplyFieldOwners(['spec', 'suspend']),
    ).toEqual([]);
  });

  it('reports an Apply-operation owner of the field', () => {
    const resource = withManagedFields([
      {
        manager: 'kustomize-controller',
        operation: 'Apply',
        fieldsV1: suspendFields,
      },
    ]);

    expect(resource.getApplyFieldOwners(['spec', 'suspend'])).toEqual([
      'kustomize-controller',
    ]);
  });

  it('ignores Update-operation owners, which never re-assert', () => {
    // This is what our own merge patches are recorded as: ownership without a
    // declared desired state, so nothing to revert to.
    const resource = withManagedFields([
      {
        manager: 'giantswarm-backstage',
        operation: 'Update',
        fieldsV1: suspendFields,
      },
    ]);

    expect(resource.getApplyFieldOwners(['spec', 'suspend'])).toEqual([]);
  });

  it('ignores an Apply owner of a different field', () => {
    const resource = withManagedFields([
      {
        manager: 'kustomize-controller',
        operation: 'Apply',
        fieldsV1: { 'f:spec': { 'f:interval': {} } },
      },
    ]);

    expect(resource.getApplyFieldOwners(['spec', 'suspend'])).toEqual([]);
  });

  it('reports every Apply owner of the field', () => {
    const resource = withManagedFields([
      {
        manager: 'kustomize-controller',
        operation: 'Apply',
        fieldsV1: suspendFields,
      },
      { manager: 'someone-else', operation: 'Apply', fieldsV1: suspendFields },
      {
        manager: 'kubectl',
        operation: 'Update',
        fieldsV1: suspendFields,
      },
    ]);

    expect(resource.getApplyFieldOwners(['spec', 'suspend'])).toEqual([
      'kustomize-controller',
      'someone-else',
    ]);
  });

  it('treats an atomic parent field as owning the whole subtree', () => {
    // `f:spec: {}` — the manager owns spec wholesale, suspend included.
    const resource = withManagedFields([
      { manager: 'owner', operation: 'Apply', fieldsV1: { 'f:spec': {} } },
    ]);

    expect(resource.getApplyFieldOwners(['spec', 'suspend'])).toEqual([
      'owner',
    ]);
  });

  it('does not treat an empty field set as owning everything', () => {
    const resource = withManagedFields([
      { manager: 'owner', operation: 'Apply', fieldsV1: {} },
    ]);

    expect(resource.getApplyFieldOwners(['spec', 'suspend'])).toEqual([]);
  });

  it('skips entries with no manager name', () => {
    const resource = withManagedFields([
      { operation: 'Apply', fieldsV1: suspendFields },
    ]);

    expect(resource.getApplyFieldOwners(['spec', 'suspend'])).toEqual([]);
  });
});
