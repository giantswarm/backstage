import { useMemo } from 'react';

import { WorkspaceManagerClient } from '../apis/WorkspaceManagerClient';
import { WORKSPACE_MANAGER_SERVER } from '../lib/workspaceManager';
import { useMusterPluginApi } from './useMusterPluginApi';
import {
  useMusterServerAvailability,
  type MusterServerPresence,
} from './useMusterServerAvailability';

/**
 * workspace-manager's tools on one installation, as the signed-in person —
 * `undefined` without the muster plugin (the only way to reach
 * workspace-manager) or without an installation.
 */
export function useWorkspaceManagerClient(
  installation: string | undefined,
): WorkspaceManagerClient | undefined {
  const musterApi = useMusterPluginApi();
  return useMemo(
    () =>
      musterApi && installation
        ? new WorkspaceManagerClient(musterApi, installation)
        : undefined,
    [musterApi, installation],
  );
}

export type WorkspaceManagerAvailability = {
  /** `unknown` while the read is in flight, failed, or there is no installation. */
  presence: MusterServerPresence;
  isAvailable: boolean;
  isLoading: boolean;
};

/**
 * Whether the installation's muster lists workspace-manager. Workspaces are an
 * installation switch: every workspace surface shows only where this is true.
 */
export function useWorkspaceManagerAvailability(
  installation: string | undefined,
): WorkspaceManagerAvailability {
  const installations = useMemo(
    () => (installation ? [installation] : []),
    [installation],
  );
  const availability = useMusterServerAvailability(
    WORKSPACE_MANAGER_SERVER,
    installations,
  );
  const presence = installation
    ? availability.presenceOf(installation)
    : 'unknown';
  return {
    presence,
    isAvailable: presence === 'available',
    isLoading: availability.isLoading,
  };
}
