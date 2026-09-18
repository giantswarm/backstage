import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  ConsistencyView,
  PlatformCapabilitiesProviders,
} from '@giantswarm/backstage-plugin-platform-capabilities';
import { useInstallationInventory } from '../../../apis/installationInventory';
import { readabilityOf } from './readability';

/**
 * Reads the portal's per-installation inventory probe -- the same one every
 * Agent Platform tab uses -- and hands the Consistency view what it says about
 * reading each installation as the person. Runs under the platform
 * capabilities' query client so the probe creates none of its own.
 */
function ConsistencyWithInventory({ capability }: { capability: string }) {
  const inventory = useInstallationInventory();
  const { entries } = inventory;
  const readability = useCallback(
    (installation: string) =>
      readabilityOf(entries.find(entry => entry.installation === installation)),
    [entries],
  );
  return <ConsistencyView capability={capability} readability={readability} />;
}

/** The Consistency view of the capability the route names, under Installations. */
export function InstallationsConsistency() {
  const { capability = '' } = useParams();
  return (
    <PlatformCapabilitiesProviders>
      <ConsistencyWithInventory capability={capability} />
    </PlatformCapabilitiesProviders>
  );
}
