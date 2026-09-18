import type { InstallationReadability } from '@giantswarm/backstage-plugin-platform-capabilities';
import type { InstallationInventoryEntry } from '../../../apis/installationInventory';

/** The probe's error names for a person the installation refuses. */
const REFUSED = new Set(['ForbiddenError', 'UnauthorizedError']);

/**
 * What the portal's inventory probe says about reading an installation as
 * the signed-in person, for the Consistency view. A probe the installation
 * refused (401, 403) is *not readable*: the person has no RBAC there, so the
 * row's live dimensions are not shown as drift. An installation this portal
 * is not configured for, or one still connecting, is unknown -- the
 * manager's marks stand.
 */
export function readabilityOf(
  entry: InstallationInventoryEntry | undefined,
): InstallationReadability {
  if (!entry) {
    return { state: 'unknown' };
  }
  if (entry.probe === 'failed' && REFUSED.has(entry.error?.name ?? '')) {
    return { state: 'not readable', reason: entry.error?.message };
  }
  if (entry.probe === 'answered') {
    return { state: 'readable' };
  }
  return { state: 'unknown' };
}
