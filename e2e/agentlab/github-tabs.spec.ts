import { expect, open, test } from './fixtures';

/**
 * The GitHub Actions and Pull Requests tabs of a Component on a portal
 * without a GitHub login: the lab's Backstage has neither `gs.github` nor
 * `auth.providers.github`, like the customer portals. Opening either tab
 * there led to a "Login Required: GitHub" dialog whose popup could never
 * succeed (no GitHub provider in the auth backend), so the portal does not
 * offer them.
 *
 * The lab's catalog has no Components, so the spec answers the entity page's
 * reads (the entity and its ancestry) with one carrying
 * `github.com/project-slug`, the annotation the GitHub Actions tab asks for:
 * everything else on the page is the lab's.
 */
const COMPONENT = 'external-secrets';
const ENTITY = `**/api/catalog/entities/by-name/component/default/${COMPONENT}`;
const ANCESTRY = `${ENTITY}/ancestry`;

const component = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: COMPONENT,
    namespace: 'default',
    uid: 'e2e-github-tabs',
    annotations: { 'github.com/project-slug': `giantswarm/${COMPONENT}` },
  },
  spec: {
    type: 'service',
    lifecycle: 'production',
    owner: 'group:default/platform-admins',
  },
  relations: [],
};

test.describe('GitHub tabs without a GitHub login', () => {
  test.beforeEach(async ({ admin }) => {
    await admin.route(ENTITY, route => route.fulfill({ json: component }));
    await admin.route(ANCESTRY, route =>
      route.fulfill({
        json: {
          rootEntityRef: `component:default/${COMPONENT}`,
          items: [{ entity: component, parentEntityRefs: [] }],
        },
      }),
    );
  });

  test.afterEach(async ({ admin }) => {
    await admin.unroute(ENTITY);
    await admin.unroute(ANCESTRY);
  });

  test('a Component page offers neither tab', async ({ admin }) => {
    await open(admin, `/catalog/default/component/${COMPONENT}`);

    const tabs = admin.getByRole('navigation', { name: 'Content navigation' });
    await expect(tabs.getByRole('link', { name: 'Overview' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      tabs.getByRole('link', { name: 'Dependencies' }),
    ).toBeVisible();
    await expect(
      tabs.getByRole('link', { name: 'GitHub Actions' }),
    ).toHaveCount(0);
    await expect(tabs.getByRole('link', { name: 'Pull Requests' })).toHaveCount(
      0,
    );
    await expect(admin.getByText('Login Required')).toHaveCount(0);
  });
});
