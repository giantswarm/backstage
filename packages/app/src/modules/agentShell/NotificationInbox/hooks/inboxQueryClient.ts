import { QueryClient } from '@tanstack/react-query';

/**
 * The Notification inbox's own query client: the upstream notifications list
 * and the inbox's writes (a row marked read, "Mark all read").
 *
 * Not the agent-platform plugin's client the inbox renders under
 * (`AgentPlatformProviders`), for two reasons:
 * - that client persists every query not on its own user-scoped list to
 *   `localStorage`, so a person's notifications (titles, descriptions, links
 *   other features wrote about them) would outlive sign-out on disk unless
 *   every query here remembered to opt out;
 * - it retries a failed read with backoff, and the inbox must not wait on the
 *   store: a failed read is answered by the next signal, focus or opening of
 *   the overlay.
 *
 * Module-wide, like the stored settings' write client, so a return to the
 * shell from a classic page keeps the last list. Nothing in it is persisted.
 */
export const inboxQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false, gcTime: 0 },
  },
});
