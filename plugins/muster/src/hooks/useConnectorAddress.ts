import { useMemo } from 'react';
import { useMusterInstance } from '../components/MusterInstanceProvider';
import {
  resolveConnectorAddress,
  type ConnectorAddressResolution,
} from '../lib/serverGrouping';
import { useConnectorPageKey } from './useConnectorPageKey';

/**
 * The connector the page's address names (`resolveConnectorAddress`), and
 * whether that is still undecided (`deciding`): while the connectors are
 * read, and, for anything but a row, while muster's keys are, which tell an
 * organization's connector from muster's own. A page shows its loading
 * state while deciding, and redirects or says "not found" only after.
 */
export function useConnectorAddress(): {
  key: string;
  resolution: ConnectorAddressResolution;
  deciding: boolean;
} {
  const key = useConnectorPageKey();
  const { mcpServers, isLoading, isLoadingInstallations, isLoadingServerKeys } =
    useMusterInstance();
  const resolution = useMemo(
    () => resolveConnectorAddress(mcpServers, key),
    [mcpServers, key],
  );
  const deciding =
    isLoadingInstallations ||
    isLoading ||
    (resolution.kind !== 'row' && Boolean(isLoadingServerKeys));
  return { key, resolution, deciding };
}
