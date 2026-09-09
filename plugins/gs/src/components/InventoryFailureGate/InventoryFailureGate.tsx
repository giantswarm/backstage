import { Button } from '@material-ui/core';
import ExitToApp from '@material-ui/icons/ExitToApp';
import Refresh from '@material-ui/icons/Refresh';
import { identityApiRef, useApi } from '@backstage/core-plugin-api';
import { Gate } from '@giantswarm/backstage-plugin-ui-react';
import {
  inventoryFailureCopy,
  type InventoryFailure,
} from '../../apis/installationInventory/inventoryFailure';

export interface InventoryFailureGateProps {
  failure: InventoryFailure;
  /** Re-runs the probe: the action of every failure but a rejected token. */
  onRetry: () => void;
  /**
   * What is gated and why, leading the sentence -- e.g. "The MCP servers,
   * workflows and tools of an installation are read through its Kubernetes
   * API."
   */
  context?: string;
}

/**
 * The gate for an installation whose inventory probe failed, worded per
 * failure class (see `inventoryFailureCopy`): a rejected token names the
 * installation and offers the sign-out -- the token the API server refused
 * cannot be repaired by a silent refresh, and signing out of the portal takes
 * the person through a fresh sign-in -- a refused or failed read quotes the
 * reason and offers a retry.
 */
export function InventoryFailureGate({
  failure,
  onRetry,
  context,
}: InventoryFailureGateProps) {
  const identityApi = useApi(identityApiRef);
  const copy = inventoryFailureCopy(failure);
  const label = context ? `${context} ${copy.sentence}` : copy.sentence;
  const signOut = copy.action === 'Sign out';
  return (
    <Gate
      label={label}
      action={
        <Button
          size="small"
          variant="contained"
          color="primary"
          startIcon={
            signOut ? (
              <ExitToApp style={{ fontSize: 14 }} />
            ) : (
              <Refresh style={{ fontSize: 14 }} />
            )
          }
          onClick={() => {
            if (signOut) {
              identityApi.signOut();
            } else {
              onRetry();
            }
          }}
        >
          {copy.action}
        </Button>
      }
    />
  );
}
