/**
 * Dex's `connector_id` authorization parameter, as forwarded by the Giant
 * Swarm OIDC authenticator from the login provider's `/start` query.
 */
export const CONNECTOR_ID_PARAM = 'connector_id';

/** localStorage key holding the Dex connector this browser signed in with. */
export const SIGN_IN_CONNECTOR_STORAGE_KEY = 'gs.auth.connector';

/**
 * Where a browser remembers the Dex connector the person signed in with
 * through a pinned entry point (the login page's fallback card). The unpinned
 * main login provider reads it so that its silent re-logins -- the popups
 * that AI chat, cluster access or muster open once the refresh token is gone
 * -- return to that connector instead of the deployment's default one.
 *
 * Signing out, or explicitly picking the unpinned card again, forgets it.
 */
export interface SignInConnectorMemory {
  /** The remembered connector id, or undefined when none is remembered. */
  get(): string | undefined;
  remember(connectorId: string): void;
  forget(): void;
}

function browserLocalStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    // Access itself throws when the browser blocks site data.
    return undefined;
  }
}

/**
 * {@link SignInConnectorMemory} kept in localStorage under
 * {@link SIGN_IN_CONNECTOR_STORAGE_KEY}, so it survives reloads and is shared
 * by every tab of the portal. Storage failures (blocked site data, quota)
 * degrade to "nothing remembered".
 */
export class LocalStorageSignInConnectorMemory implements SignInConnectorMemory {
  private readonly storage: Storage | undefined;

  constructor(storage: Storage | undefined = browserLocalStorage()) {
    this.storage = storage;
  }

  get(): string | undefined {
    try {
      return this.storage?.getItem(SIGN_IN_CONNECTOR_STORAGE_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  }

  remember(connectorId: string): void {
    try {
      this.storage?.setItem(SIGN_IN_CONNECTOR_STORAGE_KEY, connectorId);
    } catch {
      // Nothing remembered; the next re-login uses the default connector.
    }
  }

  forget(): void {
    try {
      this.storage?.removeItem(SIGN_IN_CONNECTOR_STORAGE_KEY);
    } catch {
      // Nothing to forget when the storage is unavailable.
    }
  }
}
