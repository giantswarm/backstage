import { createApiRef } from '@backstage/core-plugin-api';

/** The person's answer, in the terms of an MCP elicitation result. */
export type ExternalUrlConsentAnswer = 'accept' | 'decline' | 'cancel';

export type ExternalUrlConsentRequest = {
  /** The address a server asks the person to open. */
  url: string;
  /** Who asks: the server or connector the address comes from, by the name people know it by. */
  requester: string;
  /** The requester's own words on why, shown as plain text. */
  message?: string;
  /**
   * `tab` (the default) opens a new tab with no handle back to the portal;
   * `page` navigates this tab, for a flow that returns to the current page.
   */
  target?: 'tab' | 'page';
};

/** A request waiting for the person, as the dialog host reads it. */
export type PendingExternalUrlConsent = ExternalUrlConsentRequest & {
  id: number;
};

/**
 * The one way the portal opens an address a server provided (a sign-in, a
 * connect, an MCP URL elicitation): the person sees the full address with
 * its domain highlighted and opens it with an explicit click, as the MCP
 * elicitation spec's safe URL handling asks. Nothing fetches the address
 * before that click.
 *
 * Modelled on Backstage's `OAuthRequestApi`: callers queue a request, and one
 * dialog at the app root (`ExternalUrlConsentDialogHost`) presents it.
 */
export interface ExternalUrlConsentApi {
  /**
   * Asks the person to open `request.url`, and opens it if they agree. A
   * request for the address already waiting shares its answer.
   */
  open(request: ExternalUrlConsentRequest): Promise<ExternalUrlConsentAnswer>;
  /** The request the dialog shows, if any: the oldest waiting. */
  current(): PendingExternalUrlConsent | undefined;
  /** Calls `listener` whenever {@link current} changes; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /**
   * The dialog's answer to the current request. `accept` opens the address,
   * so it must be called from the click that gave consent.
   */
  answer(id: number, answer: ExternalUrlConsentAnswer): void;
}

export const externalUrlConsentApiRef = createApiRef<ExternalUrlConsentApi>({
  id: 'gs.external-url-consent',
});
