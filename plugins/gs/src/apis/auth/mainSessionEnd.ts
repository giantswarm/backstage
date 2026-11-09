import { useCallback, useSyncExternalStore } from 'react';
import { useApiHolder } from '@backstage/core-plugin-api';
import { gsAuthProvidersApiRef } from './types';
import type { MainSessionEnd, MainSessionEndReason } from './types';

/**
 * What Dex answers a refresh with a token that a later sign-in of the same
 * person and client replaced (Dex keeps one refresh token per person and
 * client): `invalid_request` up to 2.45, `invalid_grant` from 2.46, with this
 * text either way. The auth backend passes it on in its 401's `error.message`.
 */
const CLAIMED_BY_ANOTHER_CLIENT = /already been claimed by another client/i;

/**
 * Why a refused `/refresh` of the main sign-in ended its session, from the
 * auth backend's answer: its status and its JSON body
 * (`{ error: { message } }`). Undefined for any other failure, which may be
 * passing (the issuer unreachable) and says nothing about another sign-in.
 */
export function sessionEndReasonOf(
  status: number,
  body: unknown,
): MainSessionEndReason | undefined {
  if (status !== 401) {
    return undefined;
  }
  const message = (body as { error?: { message?: unknown } } | null)?.error
    ?.message;
  return typeof message === 'string' && CLAIMED_BY_ANOTHER_CLIENT.test(message)
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
