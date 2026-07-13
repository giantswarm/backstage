import { Observable } from '@backstage/types';
import { createApiRef } from '@backstage/core-plugin-api';

/**
 * Coarse health of per-cluster access, surfaced in the sidebar status element.
 * `session-expired` is distinct from `degraded` because it is fixed by a single
 * main SSO re-login, not by the cluster recovering. `connecting` is the initial
 * state while the first access probe is still in flight -- it lets the sidebar
 * list every covered installation immediately instead of waiting for a result.
 */
export type ClusterAccessState =
  'connecting' | 'healthy' | 'degraded' | 'session-expired';

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
  /**
   * Marks an installation as connecting -- used to seed the sidebar with every
   * broker-covered installation before its first access probe settles.
   */
  recordConnecting(installation: string): void;
  recordHealthy(installation: string): void;
  recordDegraded(installation: string, reason?: string): void;
  recordSessionExpired(installation: string, reason?: string): void;
  /**
   * Drops an installation from the status set. Used for non-broker
   * installations, which are tracked by auth session state rather than probed:
   * when the user signs out of one it is no longer accessed and should leave
   * the widget entirely.
   */
  remove(installation: string): void;
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
