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
