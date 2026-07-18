import { Observable } from '@backstage/types';
import ObservableImpl from 'zen-observable';
import { MutedInstallationsApi } from './types';

const STORAGE_KEY = 'gs-muted-installations';

/**
 * localStorage-backed, multicast implementation of {@link MutedInstallationsApi}.
 *
 * Unlike the in-memory cluster-access status store, this holds user intent that
 * must survive reloads, so it persists to localStorage (and syncs across tabs via
 * the `storage` event). A single process-wide Set + a Set of subscribers is
 * enough — the muted set is tiny (a handful of installation names).
 */
export class MutedInstallationsStore implements MutedInstallationsApi {
  private muted: Set<string>;
  private readonly subscribers = new Set<(snapshot: string[]) => void>();

  private constructor() {
    this.muted = MutedInstallationsStore.load();
    // Keep multiple tabs consistent: another tab writing the key reloads ours.
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', event => {
        if (event.key === STORAGE_KEY) {
          this.muted = MutedInstallationsStore.load();
          this.notify();
        }
      });
    }
  }

  static create(): MutedInstallationsApi {
    return new MutedInstallationsStore();
  }

  private static load(): Set<string> {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return new Set();
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? new Set(parsed.filter((x): x is string => typeof x === 'string'))
        : new Set();
    } catch {
      // Private-mode / quota / parse errors: fall back to "nothing muted".
      return new Set();
    }
  }

  private persist(): void {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(this.getSnapshot()),
      );
    } catch {
      // Best-effort; the in-memory set still reflects the change for this tab.
    }
  }

  isMuted(installation: string): boolean {
    return this.muted.has(installation);
  }

  setMuted(installation: string, muted: boolean): void {
    if (muted === this.muted.has(installation)) {
      return;
    }
    if (muted) {
      this.muted.add(installation);
    } else {
      this.muted.delete(installation);
    }
    this.persist();
    this.notify();
  }

  toggle(installation: string): void {
    this.setMuted(installation, !this.muted.has(installation));
  }

  getSnapshot(): string[] {
    return [...this.muted].sort((a, b) => a.localeCompare(b));
  }

  muted$(): Observable<string[]> {
    return new ObservableImpl(subscriber => {
      const notify = (snapshot: string[]) => subscriber.next(snapshot);
      subscriber.next(this.getSnapshot());
      this.subscribers.add(notify);
      return () => {
        this.subscribers.delete(notify);
      };
    });
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    this.subscribers.forEach(notify => notify(snapshot));
  }
}
