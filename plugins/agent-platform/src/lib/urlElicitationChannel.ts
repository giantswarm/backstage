/**
 * How the tab muster returned to tells the tab that opened the page. A
 * `BroadcastChannel` where the browser has one; otherwise (and for browsers
 * that block it) a `storage` event on `localStorage`, which the browser
 * delivers to every other tab of the origin. Either way the message is only
 * `{ elicitationId, nonce }`; the receiving tab accepts it only when it
 * matches an open it made (`UrlElicitationPanel`).
 */

/** Where a tab muster returned to tells the session's other tabs. */
export const URL_ELICITATION_CHANNEL =
  'giantswarm.agent-platform.url-elicitation';

/** The fallback's storage key: written and removed at once, only the event matters. */
export const URL_ELICITATION_STORAGE_KEY = `${URL_ELICITATION_CHANNEL}.return`;

export type ElicitationReturn = { elicitationId: string; nonce: string };

function openChannel(): BroadcastChannel | undefined {
  try {
    return typeof BroadcastChannel === 'undefined'
      ? undefined
      : new BroadcastChannel(URL_ELICITATION_CHANNEL);
  } catch {
    return undefined;
  }
}

function asReturn(data: unknown): ElicitationReturn | undefined {
  const { elicitationId, nonce } = (data ?? {}) as Record<string, unknown>;
  return typeof elicitationId === 'string' &&
    elicitationId &&
    typeof nonce === 'string' &&
    nonce
    ? { elicitationId, nonce }
    : undefined;
}

/** Tells the other tabs that muster returned from this elicitation and open. */
export function announceElicitationReturn(message: ElicitationReturn): void {
  const channel = openChannel();
  if (channel) {
    channel.postMessage(message);
    channel.close();
    return;
  }
  try {
    window.localStorage.setItem(
      URL_ELICITATION_STORAGE_KEY,
      JSON.stringify({ ...message, at: Date.now() }),
    );
    window.localStorage.removeItem(URL_ELICITATION_STORAGE_KEY);
  } catch {
    // No channel and no storage: the person says Done themselves.
  }
}

/**
 * Calls `onReturn` for every return another tab announces; the returned
 * function stops listening. Listens on both transports, so a tab that has a
 * `BroadcastChannel` still hears a sender that fell back to storage.
 */
export function listenForElicitationReturn(
  onReturn: (message: ElicitationReturn) => void,
): () => void {
  const channel = openChannel();
  if (channel) {
    channel.onmessage = (event: MessageEvent) => {
      const message = asReturn(event.data);
      if (message) {
        onReturn(message);
      }
    };
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== URL_ELICITATION_STORAGE_KEY || !event.newValue) {
      return;
    }
    try {
      const message = asReturn(JSON.parse(event.newValue));
      if (message) {
        onReturn(message);
      }
    } catch {
      // Not ours.
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}
