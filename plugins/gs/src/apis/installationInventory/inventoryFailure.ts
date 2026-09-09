import type {
  InstallationInventory,
  InstallationInventoryEntry,
} from './types';

/**
 * Why an installation's inventory probe failed, as far as a gate needs to know:
 *
 * - `unauthorized` -- the API server (or the proxy in front of it) answered
 *   401: it does not accept the token the portal forwards. A silent refresh
 *   does not repair that -- it re-issues the same grant -- so the remedy is to
 *   sign out of the portal and sign in again.
 * - `forbidden` -- 403: the token was accepted, but the account may not list
 *   the API groups, a read every authenticated account normally has. Nothing
 *   the person can do here but ask; a retry is offered in case the proxy, not
 *   the apiserver, refused.
 * - `error` -- anything else (a 5xx, a timeout, no token could be minted): a
 *   retry may well succeed.
 */
export type InventoryFailureKind = 'unauthorized' | 'forbidden' | 'error';

export type InventoryFailure = {
  installation: string;
  kind: InventoryFailureKind;
  /** The error the probe failed with. */
  error: Error;
};

export type InventoryFailureCopy = {
  /** Short state label for a badge. */
  badge: string;
  /** A complete sentence naming the installation, the reason and the remedy. */
  sentence: string;
  /** Label of the action that fixes the state. */
  action: 'Sign out' | 'Retry';
};

/** The failure of one entry, or undefined while it is pending or once it answered. */
export function classifyInventoryFailure(
  entry: InstallationInventoryEntry,
): InventoryFailure | undefined {
  if (entry.probe !== 'failed' || !entry.error) {
    return undefined;
  }
  let kind: InventoryFailureKind = 'error';
  if (entry.error.name === 'UnauthorizedError') {
    kind = 'unauthorized';
  } else if (entry.error.name === 'ForbiddenError') {
    kind = 'forbidden';
  }
  return { installation: entry.installation, kind, error: entry.error };
}

export type SelectInventoryFailureOptions = {
  /**
   * Explain the home installation's failure when the pinned installation has
   * none. For a section that falls back to the home installation when the
   * pinned one runs nothing it can show (the muster section); a tab that shows
   * the pinned installation alone leaves this off.
   */
  fallBackToHome?: boolean;
};

/**
 * The failure a section scoped to `preferred` (a pinned installation, or
 * null/undefined under "All installations") has to explain: the pinned
 * installation's when the portal knows it, otherwise the home installation's --
 * the one the section shows by default. Undefined while that entry's probe is
 * pending or once it answered.
 */
export function selectInventoryFailure(
  inventory: Pick<InstallationInventory, 'entries' | 'home'>,
  preferred: string | null | undefined,
  options: SelectInventoryFailureOptions = {},
): InventoryFailure | undefined {
  const byName = new Map(
    inventory.entries.map(entry => [entry.installation, entry]),
  );
  const pinned = preferred ? byName.get(preferred) : undefined;
  if (pinned) {
    const failure = classifyInventoryFailure(pinned);
    if (failure || !options.fallBackToHome) {
      return failure;
    }
  }
  const home = inventory.home ? byName.get(inventory.home) : undefined;
  return home ? classifyInventoryFailure(home) : undefined;
}

/** What the probe answered, or the error's own words when it never answered. */
function reasonOf(error: Error): string {
  const reason = (error as { reason?: unknown }).reason;
  return typeof reason === 'string' && reason ? reason : error.message;
}

/**
 * One wording per failure class, shared by every gate so the muster section
 * and the Agent Platform tabs say the same thing. Never a bare "failed": the
 * sentence names the installation, quotes the reason and offers the remedy
 * that matches -- a rejected token needs the sign-out (a silent refresh cannot
 * widen the grant the token came from), everything else a retry.
 */
export function inventoryFailureCopy(
  failure: InventoryFailure,
): InventoryFailureCopy {
  const { installation, error } = failure;
  const reason = reasonOf(error);
  switch (failure.kind) {
    case 'unauthorized':
      return {
        badge: 'Token rejected',
        sentence: `The API server of ${installation} rejected the portal's token (${reason}): your sign-in did not grant what it requires, and a silent refresh cannot repair that. Sign out of the portal and sign in again.`,
        action: 'Sign out',
      };
    case 'forbidden':
      return {
        badge: 'Access denied',
        sentence: `The API server of ${installation} refused to list its API groups (${reason}), a read every signed-in account is normally allowed. Ask the administrators of ${installation} about your access.`,
        action: 'Retry',
      };
    default:
      return {
        badge: 'Probe failed',
        sentence: `Reading the API groups of ${installation} failed (${reason}).`,
        action: 'Retry',
      };
  }
}
