import { useCallback, useSyncExternalStore } from 'react';
import { useApiHolder } from '@backstage/core-plugin-api';
import { gsAuthProvidersApiRef } from './types';
import type { MainSessionEnd, MainSessionEndReason } from './types';

/**
 * The OAuth error Dex answers a refresh with when a later sign-in of the same
 * person and client replaced the refresh token (Dex keeps one refresh token
 * per person and client): `invalid_request` up to 2.45, `invalid_grant` from
 * 2.46, with this `error_description` either way.
 */
const CLAIMED_ERRORS: ReadonlySet<unknown> = new Set([
  'invalid_request',
  'invalid_grant',
]);
const CLAIMED_BY_ANOTHER_CLIENT = /already been claimed by another client/i;

/**
 * Why a 401 from the main sign-in's `/refresh` ended its session, from the
 * auth backend's JSON body: the issuer's OAuth error (RFC 6749 section 5.2)
 * is the `cause` of the backend's `AuthenticationError`, serialized with its
 * `error` and `error_description`. Undefined for any other failure, which may
 * be passing (the issuer unreachable) and says nothing about another sign-in.
 */
export function sessionEndReasonOf(
  body: unknown,
): MainSessionEndReason | undefined {
  const cause = (
    body as {
      error?: { cause?: { error?: unknown; error_description?: unknown } };
    } | null
  )?.error?.cause;
  return CLAIMED_ERRORS.has(cause?.error) &&
    typeof cause?.error_description === 'string' &&
    CLAIMED_BY_ANOTHER_CLIENT.test(cause.error_description)
    ? 'signed-in-elsewhere'
    : undefined;
}

/** A {@link MainSessionEnd} the main sign-in's connector records into. */
export class MainSessionEndStore implements MainSessionEnd {
  private current: MainSessionEndReason | undefined;
  private readonly listeners = new Set<() => void>();

  reason(): MainSessionEndReason | undefined {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  record(reason: MainSessionEndReason): void {
    this.set(reason);
  }

  clear(): void {
    this.set(undefined);
  }

  private set(reason: MainSessionEndReason | undefined) {
    if (reason === this.current) {
      return;
    }
    this.current = reason;
    this.listeners.forEach(listener => listener());
  }
}

/**
 * Why the portal's main session ended while the page was open, until the
 * person signs in again; undefined while it holds, and where the app has no
 * {@link gsAuthProvidersApiRef}.
 */
export function useMainSessionEnd(): MainSessionEndReason | undefined {
  const sessionEnd = useApiHolder()
    .get(gsAuthProvidersApiRef)
    ?.getMainSessionEnd?.();
  const subscribe = useCallback(
    (listener: () => void) =>
      sessionEnd ? sessionEnd.subscribe(listener) : () => {},
    [sessionEnd],
  );
  const read = () => sessionEnd?.reason();
  return useSyncExternalStore(subscribe, read, read);
}
