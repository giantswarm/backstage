import type {
  ExternalUrlConsentAnswer,
  ExternalUrlConsentApi,
} from '@giantswarm/backstage-plugin-ui-react';

/**
 * sessionStorage key recording when this tab last bounced through muster's
 * GitHub connect from the plans page, so a connect that comes back without a
 * grant is not repeated in a loop.
 */
export const PLANS_CONNECT_BOUNCE_KEY = 'plans.github.connect-bounce';

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
 * Appends `redirect=<back>` to muster's connect URL (`/oauth/proxy/start?
 * state=…`) so the callback returns the browser to the page that needed
 * GitHub. muster validates the target against its allowlist and appends
 * `server=<name>` on the way back.
 */
export function withRedirectBack(authUrl: string, back: string): string {
  const url = new URL(authUrl);
  url.searchParams.set('redirect', back);
  return url.toString();
}

/** Whether a bounce may start now (none recorded recently). */
export function bounceAllowed(now = Date.now()): boolean {
  const raw = storage()?.getItem(PLANS_CONNECT_BOUNCE_KEY);
  if (!raw) {
    return true;
  }
  const at = Number(raw);
  return !Number.isFinite(at) || now - at > BOUNCE_REPEAT_GUARD_MS;
}

/** Records that a bounce starts now. */
export function recordBounce(now = Date.now()): void {
  storage()?.setItem(PLANS_CONNECT_BOUNCE_KEY, String(now));
}

/**
 * Asks the person to open muster's GitHub connect, which replaces this page
 * and comes back to `back`, and records the bounce once they agree.
 */
export async function bounceToConnect(
  consentApi: Pick<ExternalUrlConsentApi, 'open'>,
  authUrl: string,
  back: string = window.location.href,
): Promise<ExternalUrlConsentAnswer> {
  const answer = await consentApi.open({
    url: withRedirectBack(authUrl, back),
    requester: 'muster (GitHub connect)',
    message:
      'Connect your GitHub account in muster. The page comes back here once it is connected.',
    target: 'page',
  });
  if (answer === 'accept') {
    recordBounce();
  }
  return answer;
}
