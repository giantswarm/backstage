import { formatSeconds } from '@giantswarm/backstage-plugin-agent-platform-common';

/**
 * A duration in milliseconds, as the platform writes every duration
 * ("274 ms", "1.2 s", "18 s") — the shared `formatSeconds`, for muster's
 * millisecond figures.
 */
export function formatDuration(durationMs: number): string {
  return formatSeconds(durationMs / 1000);
}
