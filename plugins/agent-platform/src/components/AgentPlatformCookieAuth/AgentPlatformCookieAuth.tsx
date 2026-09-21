import { ReactNode } from 'react';
import { CookieAuthRefreshProvider } from '@backstage/plugin-auth-react';

/**
 * Issues and refreshes the browser's user cookie for the agent-platform
 * backend, and renders its children once it is there.
 *
 * Agent avatars are `<img>` loads through that backend
 * (`/api/agent-platform/avatars/...`, see `lib/agentAvatar`), and an `<img>`
 * carries no bearer token: the backend admits that path on the plugin's user
 * cookie instead (`user-cookie` policy). Backstage's provider fetches the
 * cookie from the plugin's `/.backstage/auth/v1/cookie`, keeps it refreshed
 * ahead of its expiry, and shares the schedule across tabs — the same
 * arrangement TechDocs uses for its assets.
 *
 * Wraps the tabs that render avatars; the cookie's one round trip on entering
 * a tab is shorter than the portal's progress delay, so nothing flashes.
 */
export function AgentPlatformCookieAuth({ children }: { children: ReactNode }) {
  return (
    <CookieAuthRefreshProvider pluginId="agent-platform">
      {children}
    </CookieAuthRefreshProvider>
  );
}
