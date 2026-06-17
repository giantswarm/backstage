import { Observable } from '@backstage/types';
import { createApiRef } from '@backstage/core-plugin-api';

/**
 * Coarse health of per-cluster access, surfaced in the sidebar status element.
 * `session-expired` is distinct from `degraded` because it is fixed by a single
 * main SSO re-login, not by the cluster recovering.
 */
export type ClusterAccessState = 'healthy' | 'degraded' | 'session-expired';

export type ClusterAccessStatusEntry = {
  installation: string;
  state: ClusterAccessState;
  /** Human-readable explanation shown in the status popover. */
  reason?: string;
  lastChecked: number;
};

/**
 * Frontend store tracking the latest known access state per installation.
 * Updated by the broker-backed cluster token flow (auth failures) and by the
 * cluster list (API timeouts / unreachable management clusters), and consumed
 * by the sidebar cluster-access status element.
 */
export interface ClusterAccessStatusApi {
  recordHealthy(installation: string): void;
  recordDegraded(installation: string, reason?: string): void;
  recordSessionExpired(installation: string, reason?: string): void;
  getSnapshot(): ClusterAccessStatusEntry[];
  /**
   * Replays the latest snapshot to a new subscriber (on the next tick) and
   * emits again on every change. Consumers that need the value synchronously
   * at mount time should seed from {@link getSnapshot}.
   */
  status$(): Observable<ClusterAccessStatusEntry[]>;
}

export const clusterAccessStatusApiRef = createApiRef<ClusterAccessStatusApi>({
  id: 'plugin.gs.cluster-access-status',
});
