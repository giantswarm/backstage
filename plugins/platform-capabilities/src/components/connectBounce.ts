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

/** Whether an automatic bounce may start now (none recorded recently). */
export function bounceAllowed(now = Date.now()): boolean {
  const raw = storage()?.getItem(CONNECT_BOUNCE_KEY);
  if (!raw) {
    return true;
  }
  const at = Number(raw);
  return !Number.isFinite(at) || now - at > BOUNCE_REPEAT_GUARD_MS;
}

/**
 * Sends the browser through muster's connect and back to the current page: a
 * full-page navigation, no popup, no click. Dex redirects straight back for
 * a person who is signed in already.
 */
export function bounceToConnect(
  authUrl: string,
  navigate: (url: string) => void = url => window.location.assign(url),
  back: string = window.location.href,
): void {
  storage()?.setItem(CONNECT_BOUNCE_KEY, String(Date.now()));
  navigate(withRedirectBack(authUrl, back));
}
