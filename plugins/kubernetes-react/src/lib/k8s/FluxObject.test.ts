import { Kustomization } from './Kustomization';

function createKustomization(options: {
  requestedAt?: string;
  lastHandledReconcileAt?: string;
}): Kustomization {
  const json = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: {
      name: 'my-app',
      namespace: 'flux-system',
      annotations: options.requestedAt
        ? { 'reconcile.fluxcd.io/requestedAt': options.requestedAt }
        : undefined,
    },
    spec: {},
    status: { lastHandledReconcileAt: options.lastHandledReconcileAt },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Kustomization(json as any, 'test-installation');
}

describe('FluxObject.isReconcileRequestPending', () => {
  it('is false when no reconciliation was ever requested', () => {
    expect(createKustomization({}).isReconcileRequestPending()).toBe(false);
  });

  it('is true when the request has not been handled yet', () => {
    const resource = createKustomization({
      requestedAt: '2026-07-28T10:00:00.000Z',
      lastHandledReconcileAt: '2026-07-28T09:00:00.000Z',
    });

    expect(resource.isReconcileRequestPending()).toBe(true);
  });

  it('is true for a first-ever request, when status has no handled value', () => {
    const resource = createKustomization({
      requestedAt: '2026-07-28T10:00:00.000Z',
    });

    expect(resource.isReconcileRequestPending()).toBe(true);
  });

  it('is false once the handled value matches the request', () => {
    const requestedAt = '2026-07-28T10:00:00.000Z';
    const resource = createKustomization({
      requestedAt,
      lastHandledReconcileAt: requestedAt,
    });

    expect(resource.isReconcileRequestPending()).toBe(false);
  });

  it('compares the values verbatim rather than as timestamps', () => {
    // Flux treats the annotation as an opaque token, so an equivalent instant
    // written in a different format still counts as a new, unhandled request.
    const resource = createKustomization({
      requestedAt: '2026-07-28T10:00:00.000Z',
      lastHandledReconcileAt: '2026-07-28T10:00:00Z',
    });

    expect(resource.isReconcileRequestPending()).toBe(true);
  });

  it('exposes both raw values', () => {
    const resource = createKustomization({
      requestedAt: '2026-07-28T10:00:00.000Z',
      lastHandledReconcileAt: '2026-07-28T09:00:00.000Z',
    });

    expect(resource.getReconcileRequestedAt()).toBe('2026-07-28T10:00:00.000Z');
    expect(resource.getLastHandledReconcileAt()).toBe(
      '2026-07-28T09:00:00.000Z',
    );
  });
});

describe('FluxObject.findStatusCondition', () => {
  function withConditions(conditions?: unknown[]): Kustomization {
    return new Kustomization(
      {
        apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
        kind: 'Kustomization',
        metadata: { name: 'my-app', namespace: 'flux-system' },
        spec: {},
        status: conditions ? { conditions } : {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      'test-installation',
    );
  }

  const readyCondition = {
    type: 'Ready',
    status: 'True',
    reason: 'ReconciliationSucceeded',
    message: 'Applied revision',
    lastTransitionTime: '2026-07-28T10:00:00Z',
  };
  const reconcilingCondition = {
    type: 'Reconciling',
    status: 'True',
    reason: 'Progressing',
    message: 'Reconciliation in progress',
    lastTransitionTime: '2026-07-28T10:00:00Z',
  };

  it('finds a condition by type', () => {
    const resource = withConditions([readyCondition, reconcilingCondition]);

    expect(resource.findStatusCondition('Reconciling')).toBe(
      resource.getStatusConditions()?.[1],
    );
    expect(resource.findReadyCondition()).toMatchObject({ type: 'Ready' });
  });

  it('returns nothing for an absent type', () => {
    expect(
      withConditions([readyCondition]).findStatusCondition('Remediated'),
    ).toBeUndefined();
  });

  it('returns nothing when the resource has no conditions', () => {
    expect(withConditions().findStatusCondition('Ready')).toBeUndefined();
    expect(withConditions().findReadyCondition()).toBeUndefined();
  });
});

describe('FluxObject suspend field ownership', () => {
  function withManagedFields(managedFields: unknown[]): Kustomization {
    return new Kustomization(
      {
        apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
        kind: 'Kustomization',
        metadata: { name: 'my-app', namespace: 'flux-system', managedFields },
        spec: {},
        status: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      'test-installation',
    );
  }

  const suspendFields = { 'f:spec': { 'f:suspend': {} } };

  it('is unmanaged when nothing applies spec.suspend', () => {
    const resource = withManagedFields([
      {
        manager: 'kustomize-controller',
        operation: 'Apply',
        fieldsV1: { 'f:spec': { 'f:interval': {}, 'f:path': {} } },
      },
    ]);

    expect(resource.getSuspendFieldApplyOwners()).toEqual([]);
    expect(resource.isSuspendFieldManaged()).toBe(false);
  });

  it('is managed when kustomize-controller applies spec.suspend', () => {
    const resource = withManagedFields([
      {
        manager: 'kustomize-controller',
        operation: 'Apply',
        fieldsV1: suspendFields,
      },
    ]);

    expect(resource.getSuspendFieldApplyOwners()).toEqual([
      'kustomize-controller',
    ]);
    expect(resource.isSuspendFieldManaged()).toBe(true);
  });

  it('is managed for any apply-owner, not just kustomize-controller', () => {
    // A Flux object deployed by a HelmRelease is applied by helm-controller, and
    // a human `kubectl apply --server-side` has the same effect.
    const resource = withManagedFields([
      {
        manager: 'helm-controller',
        operation: 'Apply',
        fieldsV1: suspendFields,
      },
    ]);

    expect(resource.isSuspendFieldManaged()).toBe(true);
  });

  it('is unmanaged when only an imperative writer owns the field', () => {
    const resource = withManagedFields([
      {
        manager: 'giantswarm-backstage',
        operation: 'Update',
        fieldsV1: suspendFields,
      },
    ]);

    expect(resource.isSuspendFieldManaged()).toBe(false);
  });
});

describe('FluxObject suspend ownership and apply opt-outs', () => {
  const suspendFields = { 'f:spec': { 'f:suspend': {} } };
  const applyEntry = {
    manager: 'kustomize-controller',
    operation: 'Apply',
    fieldsV1: suspendFields,
  };

  function withAnnotations(annotations: Record<string, string>): Kustomization {
    return new Kustomization(
      {
        apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
        kind: 'Kustomization',
        metadata: {
          name: 'my-app',
          namespace: 'flux-system',
          annotations,
          managedFields: [applyEntry],
        },
        spec: {},
        status: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      'test-installation',
    );
  }

  // A managedFields entry is only rewritten by a write, so it outlives the
  // applier — an object handed over for manual control keeps a stale Apply entry.
  it.each([
    ['kustomize.toolkit.fluxcd.io/reconcile', 'disabled'],
    ['kustomize.toolkit.fluxcd.io/ssa', 'Ignore'],
    ['kustomize.toolkit.fluxcd.io/ssa', 'IfNotPresent'],
  ])('ignores a stale Apply entry when %s is %s', (annotation, value) => {
    const resource = withAnnotations({ [annotation]: value });

    expect(resource.getSuspendFieldApplyOwners()).toEqual([]);
    expect(resource.isSuspendFieldManaged()).toBe(false);
  });

  it('still reports ownership for an unrelated annotation value', () => {
    const resource = withAnnotations({
      'kustomize.toolkit.fluxcd.io/ssa': 'Merge',
      'kustomize.toolkit.fluxcd.io/reconcile': 'enabled',
    });

    expect(resource.isSuspendFieldManaged()).toBe(true);
  });

  it('still reports ownership when there are no annotations at all', () => {
    const resource = withAnnotations({});

    expect(resource.isSuspendFieldManaged()).toBe(true);
  });
});
