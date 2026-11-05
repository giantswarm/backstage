import type { Page } from '@playwright/test';
import { dismissInboxToasts, expect, open, signIn, test } from './fixtures';
import { contextOptionsFor, lab } from './lab';
import { idleTab, touch } from './userActivation';

/**
 * The Installations page after the portal session expired: the management
 * cluster versions query (`GET /api/gs/installations/versions`) refetches in
 * the background when the page remounts and never opens the Login Required
 * dialog, sends no versions read and shows no version read before the
 * expiry. A read the person starts still asks for the sign-in.
 *
 * The lab's catalog has no installation entities, so the lab's own
 * installation is added to the catalog's answer, as in
 * installations-versions. The page's clock is moved past the ID token's
 * lifetime and the session's refresh is refused, as Dex's would be.
 *
 * The standalone agent-platform chart turns the Installations page off; the
 * spec is skipped with the reason until AGENTLAB_INSTALLATIONS_PAGE=1.
 */

const ENTITIES = '**/api/catalog/entities?*';
const TYPE_FACET = '**/api/catalog/entity-facets?facet=spec.type*';

/** Lists the lab's installation on the Installations page. */
async function stageInstallation(page: Page) {
  await page.route(TYPE_FACET, async route => {
    const response = await route.fetch();
    const body = await response.json();
    const facet = body.facets['spec.type'];
    if (!facet.some((f: { value: string }) => f.value === 'installation')) {
      facet.push({ value: 'installation', count: 1 });
    }
    await route.fulfill({ response, json: body });
  });
  await page.route(ENTITIES, async route => {
    const url = decodeURIComponent(route.request().url());
    if (!url.includes('kind=resource')) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const entities: { metadata: { name: string } }[] = await response.json();
    if (!entities.some(e => e.metadata.name === lab.installation)) {
      entities.push({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Resource',
        metadata: {
          name: lab.installation,
          namespace: 'default',
          labels: { 'giantswarm.io/provider': 'kind' },
        },
        spec: { type: 'installation', owner: 'group:default/platform-admins' },
      } as any);
    }
    await route.fulfill({ response, json: entities });
  });
}

function loginRequired(page: Page) {
  return page.getByRole('dialog', { name: 'Login Required' });
}

/** Whether the Login Required dialog shows within `timeout`. */
async function prompts(page: Page, timeout: number): Promise<boolean> {
  return loginRequired(page)
    .waitFor({ state: 'visible', timeout })
    .then(
      () => true,
      () => false,
    );
}

/**
 * Expires the portal session: its refresh is refused, as Dex's would be, and
 * the page's clock moves past the ID token's lifetime.
 */
async function expireSession(page: Page) {
  await page.route('**/api/auth/*/refresh**', route =>
    route.fulfill({
      status: 401,
      json: { error: { name: 'AuthenticationError' } },
    }),
  );
  await page.clock.fastForward('02:00:00');
}

test('a versions refetch on the Installations page after the session expired opens no Login Required dialog', async ({
  browser,
}) => {
  test.skip(
    !process.env.AGENTLAB_INSTALLATIONS_PAGE,
    'needs a lab whose Backstage enables page:gs/installations (the standalone chart turns it off); set AGENTLAB_INSTALLATIONS_PAGE=1',
  );
  test.setTimeout(240_000);
  const context = await browser.newContext(contextOptionsFor('desktop'));
  try {
    const page = await context.newPage();
    await page.clock.install();
    await idleTab(page);
    await dismissInboxToasts(page);
    await stageInstallation(page);
    await signIn(page, lab.users.admin);
    await open(page, '/installations');

    const kubernetes = page.getByTestId(
      `version-kubernetes-${lab.installation}`,
    );
    await expect(kubernetes).toHaveText(/^1\.\d+\.\d+/, { timeout: 120_000 });

    const versionReads: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/gs/installations/versions')) {
        versionReads.push(request.url());
      }
    });
    await expireSession(page);
    await page.clock.runFor('00:10:00');
    // The page leaves for the catalog and comes back without a gesture (the
    // history's own navigation, as a redirect or a back step does): the
    // Installations page remounts and its stale versions query refetches in
    // the background.
    for (const path of ['/catalog', '/installations']) {
      await page.evaluate(to => {
        window.history.pushState({}, '', to);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, path);
      await page.waitForTimeout(3_000);
    }
    await page.waitForTimeout(10_000);

    expect(
      await prompts(page, 5_000),
      'the versions refetch opened no Login Required dialog',
    ).toBe(false);
    expect(
      versionReads,
      'no versions read leaves the page without a session',
    ).toEqual([]);
    // Signed out, the page shows none of the versions it read for the
    // person. (The remount's catalog read fails silently too, so the table
    // shows the catalog's error rather than rows; the unit tests pin the
    // cells' Not signed in state while the rows stay.)
    await expect(
      page.getByText(/^1\.\d+\.\d+/),
      'no version read before the expiry is shown',
    ).toHaveCount(0, { timeout: 30_000 });
    await test.info().attach('installations-after-expiry', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    // The person's own action still asks for the sign-in: opening Clusters
    // from the sidebar, in the app (no reload).
    await touch(page);
    await page
      .getByRole('navigation', { name: 'sidebar nav' })
      .getByRole('link', { name: 'Clusters' })
      .click();
    await expect(
      loginRequired(page),
      'the person’s action asks for the sign-in',
    ).toBeVisible({ timeout: 60_000 });
  } finally {
    await context.close();
  }
});
