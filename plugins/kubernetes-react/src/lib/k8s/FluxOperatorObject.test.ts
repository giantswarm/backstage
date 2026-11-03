import { ResourceSet } from './ResourceSet';

function createResourceSet(
  options: {
    annotations?: Record<string, string>;
    managedFields?: unknown[];
    suspend?: boolean;
    history?: unknown[];
  } = {},
): ResourceSet {
  const json = {
    apiVersion: 'fluxcd.controlplane.io/v1',
    kind: 'ResourceSet',
    metadata: {
      name: 'apps',
      namespace: 'flux-system',
      annotations: options.annotations,
      managedFields: options.managedFields,
    },
    spec: { suspend: options.suspend },
    status: { history: options.history },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ResourceSet(json as any, 'test-installation');
}

const applyEntry = (manager: string, fieldsV1: unknown) => ({
  manager,
  operation: 'Apply',
  fieldsV1,
});

describe('FluxOperatorObject', () => {
  describe('isSuspended', () => {
    it('is true when reconciliation is disabled by annotation', () => {
      const resource = createResourceSet({
        annotations: { 'fluxcd.controlplane.io/reconcile': 'disabled' },
      });

      expect(resource.isSuspended()).toBe(true);
    });

    it.each([['enabled'], [undefined]])(
      'is false when the annotation is %s',
      value => {
        const resource = createResourceSet({
          annotations: value
            ? { 'fluxcd.controlplane.io/reconcile': value }
            : undefined,
        });

        expect(resource.isSuspended()).toBe(false);
      },
    );

    it('ignores spec.suspend, which the operator kinds do not have', () => {
      expect(createResourceSet({ suspend: true }).isSuspended()).toBe(false);
    });
  });

  it('reads who suspended the object', () => {
    const resource = createResourceSet({
      annotations: {
        'fluxcd.controlplane.io/reconcile': 'disabled',
        'fluxcd.controlplane.io/suspendedBy': 'jane@example.com',
      },
    });

    expect(resource.getSuspendedBy()).toBe('jane@example.com');
  });

  it('suspends and resumes through the reconcile annotation', () => {
    const resource = createResourceSet();

    expect(resource.getSuspendPatch(true, 'jane@example.com')).toEqual({
      metadata: {
        annotations: {
          'fluxcd.controlplane.io/reconcile': 'disabled',
          'fluxcd.controlplane.io/suspendedBy': 'jane@example.com',
        },
      },
    });
    // Resuming clears the record, so a later suspension never shows an
    // earlier suspender.
    expect(resource.getSuspendPatch(false, 'jane@example.com')).toEqual({
      metadata: {
        annotations: {
          'fluxcd.controlplane.io/reconcile': 'enabled',
          'fluxcd.controlplane.io/suspendedBy': null,
        },
      },
    });
    // Without a known actor, a stale record is cleared rather than kept.
    expect(resource.getSuspendPatch(true)).toEqual({
      metadata: {
        annotations: {
          'fluxcd.controlplane.io/reconcile': 'disabled',
          'fluxcd.controlplane.io/suspendedBy': null,
        },
      },
    });
    expect(resource.getSuspendFieldName()).toBe(
      'fluxcd.controlplane.io/reconcile',
    );
  });

  describe('getSuspendFieldApplyOwners', () => {
    it('names the managers that apply the reconcile annotation', () => {
      const resource = createResourceSet({
        managedFields: [
          applyEntry('kustomize-controller', {
            'f:metadata': {
              'f:annotations': { 'f:fluxcd.controlplane.io/reconcile': {} },
            },
          }),
        ],
      });

      expect(resource.getSuspendFieldApplyOwners()).toEqual([
        'kustomize-controller',
      ]);
      expect(resource.isSuspendFieldManaged()).toBe(true);
    });

    it('does not count managers that apply other fields only', () => {
      const resource = createResourceSet({
        managedFields: [
          applyEntry('kustomize-controller', {
            'f:metadata': { 'f:annotations': { 'f:other': {} } },
            'f:spec': { 'f:suspend': {} },
          }),
        ],
      });

      expect(resource.getSuspendFieldApplyOwners()).toEqual([]);
    });
  });

  it('reads the most recent reconciliation, which the operator lists first', () => {
    const latest = {
      digest: 'sha256:2',
      firstReconciled: '2026-10-01T10:00:00Z',
      lastReconciled: '2026-10-05T10:00:00Z',
      lastReconciledDuration: '1.5s',
      lastReconciledStatus: 'ReconciliationSucceeded',
      totalReconciliations: 12,
    };
    const resource = createResourceSet({
      history: [
        latest,
        {
          ...latest,
          digest: 'sha256:1',
          lastReconciled: '2026-09-30T10:00:00Z',
        },
      ],
    });

    expect(resource.getLastReconciliation()).toEqual(latest);
    expect(createResourceSet().getLastReconciliation()).toBeUndefined();
  });
});
