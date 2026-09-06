/**
 * sessionStorage key recording when this tab last bounced through muster's
 * GitHub connect from the roadmap page, so a connect that comes back without a
 * grant is not repeated in a loop.
 */
export const ROADMAP_CONNECT_BOUNCE_KEY = 'roadmap.github.connect-bounce';

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

/** Whether an automatic bounce may start now (none recorded recently). */
export function bounceAllowed(now = Date.now()): boolean {
  const raw = storage()?.getItem(ROADMAP_CONNECT_BOUNCE_KEY);
  if (!raw) {
    return true;
  }
  const at = Number(raw);
  return !Number.isFinite(at) || now - at > BOUNCE_REPEAT_GUARD_MS;
}

/** Records that a bounce starts now. */
export function recordBounce(now = Date.now()): void {
  storage()?.setItem(ROADMAP_CONNECT_BOUNCE_KEY, String(now));
}

/**
 * Sends the browser through muster's GitHub connect and back to the current
 * page: a full-page navigation, no popup, no click. GitHub redirects straight
 * back for an App the person already authorized at their login.
 */
export function bounceToConnect(
  authUrl: string,
  navigate: (url: string) => void = url => window.location.assign(url),
  back: string = window.location.href,
): void {
  recordBounce();
  navigate(withRedirectBack(authUrl, back));
}
