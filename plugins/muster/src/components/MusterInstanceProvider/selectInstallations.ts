import type { InstallationInventory } from '@giantswarm/backstage-plugin-gs';
import type { MusterInstallationInfo } from '../../apis/types';

/** The part of the installation inventory the selection reads. */
export type InventoryView = Pick<
  InstallationInventory,
  'entries' | 'home' | 'installationsWith'
>;

/** Access states in which a pending inventory probe may still answer. */
const CAN_STILL_ANSWER = new Set(['healthy', 'connecting']);

/** Home first, otherwise the given order. */
export function homeFirst<T extends { name: string }>(
  installations: T[],
  home: string | undefined,
): T[] {
  if (!home) {
    return installations;
  }
  const homeEntry = installations.find(
    installation => installation.name === home,
  );
  return homeEntry
    ? [
        homeEntry,
        ...installations.filter(installation => installation !== homeEntry),
      ]
    : installations;
}

/**
 * The muster installations the picker offers: the backend's installations
 * (an endpoint the proxy can target -- derived from the base domain or
 * configured) intersected with the installations whose inventory has the
 * `muster.giantswarm.io` API group and whose cluster access is healthy
 * (`installationsWith('muster')`), home first.
 *
 * A CRD group without a backend endpoint cannot be reached; a backend endpoint
 * without the CRD group is not a muster installation. Two exceptions keep the
 * portal usable while the inventory cannot say:
 *
 * - No inventory at all (the portal has no `gs.installations`, the legacy
 *   single-installation setup): the backend's list is all there is.
 * - The person's explicit choice (`?installation=`, or the stored one) stays
 *   listed while its probe is still pending and can still answer, so a deep
 *   link to an installation the inventory has not reached yet is not replaced
 *   by the default. Once the probe answers without muster it drops out.
 */
export function selectMusterInstallations(
  backend: MusterInstallationInfo[],
  inventory: InventoryView,
  preferred: string | null | undefined,
): MusterInstallationInfo[] {
  if (inventory.entries.length === 0) {
    return backend;
  }
  const withMuster = new Set(inventory.installationsWith('muster'));
  const entries = new Map(
    inventory.entries.map(entry => [entry.installation, entry]),
  );
  const listed = backend.filter(info => {
    if (withMuster.has(info.name)) {
      return true;
    }
    if (info.name !== preferred) {
      return false;
    }
    const entry = entries.get(info.name);
    return (
      entry !== undefined &&
      entry.probe === 'pending' &&
      CAN_STILL_ANSWER.has(entry.accessState)
    );
  });
  return homeFirst(listed, inventory.home);
}
