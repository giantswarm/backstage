import { Observable } from '@backstage/types';
import { createApiRef } from '@backstage/core-plugin-api';

/**
 * User-controlled, app-wide on/off state for installations. A *muted*
 * installation is treated as switched off everywhere: the `ClusterAccessConnector`
 * doesn't probe it, and fleet views (Clusters/Deployments pages, agent-platform)
 * don't fetch from it. This is deliberately distinct from the health-based
 * `useDisabledInstallations` hook (which auto-detects unreachable backends) — this
 * is explicit user intent, so it is persisted per-browser rather than derived from
 * live probes.
 */
export interface MutedInstallationsApi {
  isMuted(installation: string): boolean;
  /** Turn an installation off (muted=true) or back on (muted=false). */
  setMuted(installation: string, muted: boolean): void;
  toggle(installation: string): void;
  /** Sorted snapshot of currently-muted installation names. */
  getSnapshot(): string[];
  /**
   * Replays the latest snapshot to a new subscriber (on the next tick) and
   * emits again on every change. Consumers that need the value synchronously at
   * mount time should seed from {@link getSnapshot}.
   */
  muted$(): Observable<string[]>;
}

export const mutedInstallationsApiRef = createApiRef<MutedInstallationsApi>({
  id: 'plugin.gs.muted-installations',
});
