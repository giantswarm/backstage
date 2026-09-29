import { useMemo } from 'react';
import { selectInventoryFailure } from '../../apis/installationInventory/inventoryFailure';
import { useInstallationInventory } from '../../apis/installationInventory/useInstallationInventory';
import { ALL_INSTALLATIONS } from '../../apis/installationScope/installationScopeStore';
import { useInstallationScope } from '../../apis/installationScope/useInstallationScope';
import { InventoryFailureGate } from '../InventoryFailureGate';

export interface InstallationInventoryGateProps {
  /** What is gated and why, leading the sentence (see `InventoryFailureGate`). */
  context?: string;
}

/**
 * The gate an Agent Platform tab renders when the installation it reads --
 * the pinned one, or the home installation under "All installations" -- could
 * not be asked which platform components it runs: names the installation,
 * quotes the reason and offers the remedy (`inventoryFailureCopy`). Renders
 * nothing while that probe is pending or once it answered; the tab's own
 * notes and empty states speak then.
 *
 * Reads the section's installation scope and the inventory itself, so a tab
 * drops it in next to its scope note; the muster section, whose provider
 * already holds the inventory, renders `InventoryFailureGate` directly.
 */
export function InstallationInventoryGate({
  context,
}: InstallationInventoryGateProps) {
  const { scope } = useInstallationScope();
  const inventory = useInstallationInventory();
  const failure = useMemo(
    () =>
      selectInventoryFailure(
        inventory,
        scope === ALL_INSTALLATIONS ? null : scope,
      ),
    [inventory, scope],
  );

  if (!failure) {
    return null;
  }
  return (
    <InventoryFailureGate
      failure={failure}
      onRetry={inventory.refresh}
      context={context}
    />
  );
}
