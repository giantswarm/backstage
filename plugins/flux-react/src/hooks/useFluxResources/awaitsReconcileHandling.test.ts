import { Kustomization } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  awaitsReconcileHandling,
  PENDING_REQUEST_WINDOW,
} from './awaitsReconcileHandling';

const NOW = Date.parse('2026-07-28T12:00:00.000Z');

function createKustomization(options: {
  suspend?: boolean;
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
    spec: { suspend: options.suspend },
    status: { lastHandledReconcileAt: options.lastHandledReconcileAt },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Kustomization(json as any, 'test-installation');
}

/** An ISO timestamp `ms` before the frozen "now". */
function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe('awaitsReconcileHandling', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is false when no reconciliation was requested', () => {
    expect(awaitsReconcileHandling(createKustomization({}))).toBe(false);
  });

  it('is true for a fresh unhandled request', () => {
    const resource = createKustomization({
      requestedAt: ago(1000),
      lastHandledReconcileAt: ago(60_000),
    });

    expect(awaitsReconcileHandling(resource)).toBe(true);
  });

  it('is false once the request has been handled', () => {
    const requestedAt = ago(1000);
    const resource = createKustomization({
      requestedAt,
      lastHandledReconcileAt: requestedAt,
    });

    expect(awaitsReconcileHandling(resource)).toBe(false);
  });

  it('is false for a suspended resource, which can never converge', () => {
    // Reachable with the UI's own buttons: Reconcile, then Suspend before the
    // controller picks the request up. Flux returns early on spec.suspend
    // without patching status, so the request stays outstanding indefinitely.
    const resource = createKustomization({
      suspend: true,
      requestedAt: ago(1000),
      lastHandledReconcileAt: ago(60_000),
    });

    expect(awaitsReconcileHandling(resource)).toBe(false);
    // Flux itself still considers it outstanding — only the poll declines to
    // chase it.
    expect(resource.isReconcileRequestPending()).toBe(true);
  });

  it('stops chasing a request nothing ever handled', () => {
    // e.g. a CRD installed without its controller running.
    const resource = createKustomization({
      requestedAt: ago(PENDING_REQUEST_WINDOW + 1000),
    });

    expect(awaitsReconcileHandling(resource)).toBe(false);
    expect(resource.isReconcileRequestPending()).toBe(true);
  });

  it('still chases a request just inside the window', () => {
    const resource = createKustomization({
      requestedAt: ago(PENDING_REQUEST_WINDOW - 1000),
    });

    expect(awaitsReconcileHandling(resource)).toBe(true);
  });

  it('tolerates a clock ahead of ours', () => {
    const resource = createKustomization({
      requestedAt: new Date(NOW + 5000).toISOString(),
    });

    expect(awaitsReconcileHandling(resource)).toBe(true);
  });

  it('does not chase a wildly future timestamp', () => {
    const resource = createKustomization({
      requestedAt: new Date(NOW + PENDING_REQUEST_WINDOW + 1000).toISOString(),
    });

    expect(awaitsReconcileHandling(resource)).toBe(false);
  });

  it('does not chase an unparseable annotation value', () => {
    // The annotation is an opaque token to Flux, so anything can be in there.
    const resource = createKustomization({ requestedAt: 'triggered-by-hand' });

    expect(awaitsReconcileHandling(resource)).toBe(false);
    expect(resource.isReconcileRequestPending()).toBe(true);
  });
});
