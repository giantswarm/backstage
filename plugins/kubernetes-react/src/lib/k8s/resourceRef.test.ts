import { getApiGroupFromVersion, refMatchesResource } from './resourceRef';

const kubeadmControlPlane = {
  kind: 'KubeadmControlPlane',
  group: 'controlplane.cluster.x-k8s.io',
  apiVersion: 'controlplane.cluster.x-k8s.io/v1beta2',
};

const configMap = {
  kind: 'ConfigMap',
  group: '',
  apiVersion: 'v1',
};

describe('getApiGroupFromVersion', () => {
  it('returns the group of a grouped apiVersion', () => {
    expect(
      getApiGroupFromVersion('controlplane.cluster.x-k8s.io/v1beta1'),
    ).toBe('controlplane.cluster.x-k8s.io');
  });

  it('returns undefined for a core apiVersion', () => {
    expect(getApiGroupFromVersion('v1')).toBeUndefined();
  });

  it('returns undefined when the apiVersion is missing', () => {
    expect(getApiGroupFromVersion(undefined)).toBeUndefined();
    expect(getApiGroupFromVersion('')).toBeUndefined();
  });
});

describe('refMatchesResource', () => {
  it('matches a v1beta2 ref (apiGroup) with the same kind and group', () => {
    expect(
      refMatchesResource(
        {
          apiGroup: 'controlplane.cluster.x-k8s.io',
          kind: 'KubeadmControlPlane',
        },
        kubeadmControlPlane,
      ),
    ).toBe(true);
  });

  it('matches a v1beta1 ref (apiVersion) regardless of the version suffix', () => {
    expect(
      refMatchesResource(
        {
          apiVersion: 'controlplane.cluster.x-k8s.io/v1beta1',
          kind: 'KubeadmControlPlane',
        },
        kubeadmControlPlane,
      ),
    ).toBe(true);
  });

  it('matches on kind alone when the ref carries neither apiGroup nor apiVersion', () => {
    expect(
      refMatchesResource({ kind: 'KubeadmControlPlane' }, kubeadmControlPlane),
    ).toBe(true);
  });

  it('rejects a different kind in the same group (AWSManagedControlPlane)', () => {
    expect(
      refMatchesResource(
        {
          apiVersion: 'controlplane.cluster.x-k8s.io/v1beta2',
          kind: 'AWSManagedControlPlane',
        },
        kubeadmControlPlane,
      ),
    ).toBe(false);
  });

  it('rejects a different kind in a different group (AzureASOManagedControlPlane)', () => {
    expect(
      refMatchesResource(
        {
          apiGroup: 'infrastructure.cluster.x-k8s.io',
          kind: 'AzureASOManagedControlPlane',
        },
        kubeadmControlPlane,
      ),
    ).toBe(false);
  });

  it('rejects the same kind from a foreign group', () => {
    expect(
      refMatchesResource(
        { apiGroup: 'example.com', kind: 'KubeadmControlPlane' },
        kubeadmControlPlane,
      ),
    ).toBe(false);
  });

  it('rejects a core apiVersion for a grouped resource', () => {
    expect(
      refMatchesResource(
        { apiVersion: 'v1', kind: 'KubeadmControlPlane' },
        kubeadmControlPlane,
      ),
    ).toBe(false);
  });

  it('rejects a malformed apiVersion (group without version) for a grouped resource', () => {
    expect(
      refMatchesResource(
        {
          apiVersion: 'controlplane.cluster.x-k8s.io',
          kind: 'KubeadmControlPlane',
        },
        kubeadmControlPlane,
      ),
    ).toBe(false);
  });

  it('reads an empty apiGroup as the core group', () => {
    expect(
      refMatchesResource({ apiGroup: '', kind: 'ConfigMap' }, configMap),
    ).toBe(true);
    expect(
      refMatchesResource(
        { apiGroup: '', kind: 'KubeadmControlPlane' },
        kubeadmControlPlane,
      ),
    ).toBe(false);
  });

  it('prefers apiGroup over apiVersion when a ref carries both', () => {
    expect(
      refMatchesResource(
        {
          apiGroup: 'controlplane.cluster.x-k8s.io',
          apiVersion: 'example.com/v1',
          kind: 'KubeadmControlPlane',
        },
        kubeadmControlPlane,
      ),
    ).toBe(true);
  });

  it('matches a core resource only on the exact apiVersion', () => {
    expect(
      refMatchesResource({ apiVersion: 'v1', kind: 'ConfigMap' }, configMap),
    ).toBe(true);
    expect(
      refMatchesResource({ apiVersion: 'v2', kind: 'ConfigMap' }, configMap),
    ).toBe(false);
  });

  it('rejects a grouped apiVersion for a core resource', () => {
    expect(
      refMatchesResource(
        { apiVersion: 'example.com/v1', kind: 'ConfigMap' },
        configMap,
      ),
    ).toBe(false);
  });
});
