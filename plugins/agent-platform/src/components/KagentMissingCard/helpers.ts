import {
  ALL_INSTALLATIONS,
  type InstallationInventoryEntry,
  type InstallationScope,
} from '@giantswarm/backstage-plugin-gs';

/**
 * The environments in scope when every one of them answered its inventory
 * probe without kagent: the pinned one, or under "All installations" every
 * one not switched off in the sidebar. Undefined while any of them is still
 * pending, failed, or runs kagent -- an environment that could not be asked
 * is not one without kagent, and the inventory gate speaks for it.
 */
export function kagentMissingFrom(
  entries: InstallationInventoryEntry[],
  scope: InstallationScope,
): string[] | undefined {
  const inScope =
    scope === ALL_INSTALLATIONS
      ? entries.filter(entry => !entry.muted)
      : entries.filter(entry => entry.installation === scope);
  if (
    inScope.length === 0 ||
    !inScope.every(
      entry => entry.probe === 'answered' && !entry.components.kagent,
    )
  ) {
    return undefined;
  }
  return inScope.map(entry => entry.installation);
}
