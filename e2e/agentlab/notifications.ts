import type { Page } from '@playwright/test';

/** What {@link stubNotifications} answers. */
export const NOTIFICATIONS = '**/api/notifications/notifications**';

/**
 * A notification the upstream notifications store holds for the signed-in
 * person, as the backend answers `GET /api/notifications/notifications`.
 */
export type StubNotification = {
  id: string;
  title: string;
  description?: string;
  link?: string;
  read?: boolean;
};

/**
 * Stages the person's notifications store at the browser. No portal feature
 * sends to the store in the lab, so the list the inbox reads, and the "mark
 * read" write it sends, are answered here; everything else — the shell, the
 * session rows, the signals socket — is the lab's.
 *
 * Returns the ids each write marked read. Call `page.unroute(NOTIFICATIONS)`
 * after the test: the worker's page outlives it.
 */
export async function stubNotifications(
  page: Page,
  notifications: StubNotification[],
): Promise<{ marked: string[][] }> {
  const store = notifications.map(n => ({ ...n }));
  const marked: string[][] = [];
  await page.route(NOTIFICATIONS, async route => {
    const url = new URL(route.request().url());
    if (
      route.request().method() === 'POST' &&
      url.pathname.endsWith('/update')
    ) {
      const { ids } = route.request().postDataJSON() as { ids: string[] };
      marked.push(ids);
      store.forEach(n => {
        if (ids.includes(n.id)) {
          n.read = true;
        }
      });
      await route.fulfill({ json: [] });
      return;
    }
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const read = url.searchParams.get('read');
    const listed = store.filter(
      n => read === null || String(Boolean(n.read)) === read,
    );
    const created = new Date(Date.now() - 5 * 60_000).toISOString();
    await route.fulfill({
      json: {
        totalCount: listed.length,
        notifications: listed.map(n => ({
          id: n.id,
          user: 'user:default/admin',
          origin: 'plugin:e2e',
          created,
          ...(n.read ? { read: created } : {}),
          payload: {
            title: n.title,
            description: n.description,
            link: n.link,
            severity: 'normal',
          },
        })),
      },
    });
  });
  return { marked };
}
