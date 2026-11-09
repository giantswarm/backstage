import type {
  ExternalUrlConsentAnswer,
  ExternalUrlConsentApi,
} from '@giantswarm/backstage-plugin-ui-react';

/**
 * sessionStorage key recording when this tab last bounced through muster's
 * connect for the platform manager, so a connect that comes back without a
 * grant is not repeated in a loop.
 */
export const CONNECT_BOUNCE_KEY =
  'platform-capabilities.manager.connect-bounce';

/** A bounce younger than this is not repeated; the person gets the button. */
const BOUNCE_REPEAT_GUARD_MS = 2 * 60_000;

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * Appends `redirect=<back>` to muster's connect URL so the callback returns
 * the browser to the page that needed the manager. muster validates the
 * target against its allowlist.
 */
export function withRedirectBack(authUrl: string, back: string): string {
  const url = new URL(authUrl);
  url.searchParams.set('redirect', back);
  return url.toString();
}

/** Whether a bounce may start now (none recorded recently). */
export function bounceAllowed(now = Date.now()): boolean {
  const raw = storage()?.getItem(CONNECT_BOUNCE_KEY);
  if (!raw) {
    return true;
  }
  const at = Number(raw);
  return !Number.isFinite(at) || now - at > BOUNCE_REPEAT_GUARD_MS;
}

/**
 * Asks the person to open muster's connect, which replaces this page and
 * comes back to `back`, and records the bounce once they agree.
 */
export async function bounceToConnect(
  consentApi: Pick<ExternalUrlConsentApi, 'open'>,
  authUrl: string,
  back: string = window.location.href,
): Promise<ExternalUrlConsentAnswer> {
  const answer = await consentApi.open({
    url: withRedirectBack(authUrl, back),
    requester: 'Platform manager',
    message:
      'Sign in to the platform manager through muster. The page comes back here once you are signed in.',
    target: 'page',
  });
  if (answer === 'accept') {
    storage()?.setItem(CONNECT_BOUNCE_KEY, String(Date.now()));
  }
  return answer;
}
