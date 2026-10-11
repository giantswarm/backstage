import { ReactNode, useEffect } from 'react';
import { ErrorPanel, Progress } from '@backstage/core-components';
import { useCookieAuthRefresh } from '@backstage/plugin-auth-react';
import { Button } from '@backstage/ui';

/**
 * How long before the cookie's expiry this page stops trusting it without
 * asking: the provider refreshes it 1–4 minutes ahead, so a minute short of
 * the expiry a cookie issued in this page load is still the one the browser
 * holds.
 */
const TRUST_MARGIN_MS = 60_000;

/**
 * Until when the cookie issued earlier in this page load is known to be
 * valid. Module state on purpose: it outlives the tabs that mount this
 * component, which is the point.
 */
let cookieValidUntil = 0;

/** Exported for tests: forget the cookie this page load was issued. */
export function resetAgentPlatformCookieMemory() {
  cookieValidUntil = 0;
}

/**
 * Issues and refreshes the browser's user cookie for the agent-platform
 * backend, and renders its children once it is there.
 *
 * Agent avatars are `<img>` loads through that backend
 * (`/api/agent-platform/avatars/...`, see `lib/agentAvatar`), and an `<img>`
 * carries no bearer token: the backend admits that path on the plugin's user
 * cookie instead (`user-cookie` policy). Backstage's hook fetches the cookie
 * from the plugin's `/.backstage/auth/v1/cookie`, keeps it refreshed ahead of
 * its expiry, and shares the schedule across tabs — the same arrangement
 * TechDocs uses for its assets.
 *
 * Backstage's `CookieAuthRefreshProvider`, but waiting only once per page
 * load: it holds the content back for the cookie's round trip on every mount,
 * and every navigation into the Agents or Sessions tab from another page
 * (Customize → an agent, the rail → a session) mounts it afresh — so the
 * page's own frame came a round trip late each time, after an empty content
 * area (T95). Once a cookie has been issued in this page load and is not
 * about to expire, the content renders at once and the cookie is re-read
 * beside it.
 */
export function AgentPlatformCookieAuth({ children }: { children: ReactNode }) {
  const result = useCookieAuthRefresh({ pluginId: 'agent-platform' });
  const expiresAt =
    result.status === 'success' ? result.data.expiresAt : undefined;

  useEffect(() => {
    if (expiresAt) {
      cookieValidUntil = Date.parse(expiresAt) - TRUST_MARGIN_MS;
    }
  }, [expiresAt]);

  if (
    result.status === 'success' ||
    (result.status === 'loading' && Date.now() < cookieValidUntil)
  ) {
    return <>{children}</>;
  }
  if (result.status === 'loading') {
    return <Progress />;
  }
  return (
    <ErrorPanel error={result.error}>
      <Button variant="secondary" onPress={result.retry}>
        Retry
      </Button>
    </ErrorPanel>
  );
}
