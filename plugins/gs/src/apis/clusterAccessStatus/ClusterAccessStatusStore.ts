import { Observable } from '@backstage/types';
import ObservableImpl from 'zen-observable';
import {
  ClusterAccessState,
  ClusterAccessStatusApi,
  ClusterAccessStatusEntry,
} from './types';

/**
 * In-memory, multicast implementation of {@link ClusterAccessStatusApi}.
 *
 * ponytail: a single process-wide map + a Set of subscribers is enough -- the
 * status set is tiny (one entry per accessed cluster) and lives only for the
 * tab's lifetime. No persistence, no external state library.
 */
export class ClusterAccessStatusStore implements ClusterAccessStatusApi {
  private readonly entries = new Map<string, ClusterAccessStatusEntry>();
  private readonly subscribers = new Set<
    (snapshot: ClusterAccessStatusEntry[]) => void
  >();

  static create(): ClusterAccessStatusApi {
    return new ClusterAccessStatusStore();
  }

  recordConnecting(installation: string): void {
    this.record(installation, 'connecting', undefined);
  }

  recordHealthy(installation: string): void {
    this.record(installation, 'healthy', undefined);
  }

  recordDegraded(installation: string, reason?: string): void {
    this.record(installation, 'degraded', reason);
  }

  recordSessionExpired(installation: string, reason?: string): void {
    this.record(installation, 'session-expired', reason);
  }

  getSnapshot(): ClusterAccessStatusEntry[] {
    return [...this.entries.values()].sort((a, b) =>
      a.installation.localeCompare(b.installation),
    );
  }

  status$(): Observable<ClusterAccessStatusEntry[]> {
    return new ObservableImpl(subscriber => {
      const notify = (snapshot: ClusterAccessStatusEntry[]) =>
        subscriber.next(snapshot);
      subscriber.next(this.getSnapshot());
      this.subscribers.add(notify);
      return () => {
        this.subscribers.delete(notify);
      };
    });
  }

  private record(
    installation: string,
    state: ClusterAccessState,
    reason: string | undefined,
  ): void {
    const previous = this.entries.get(installation);
    if (previous && previous.state === state && previous.reason === reason) {
      // No state change -- only refresh the timestamp, don't churn subscribers.
      previous.lastChecked = Date.now();
      return;
    }
    this.entries.set(installation, {
      installation,
      state,
      reason,
      lastChecked: Date.now(),
    });
    const snapshot = this.getSnapshot();
    this.subscribers.forEach(notify => notify(snapshot));
  }
}
