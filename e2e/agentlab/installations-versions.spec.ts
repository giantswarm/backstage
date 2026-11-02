import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The management cluster versions on the Installations page
 * (giantswarm/backstage#2704): the Kubernetes version and the Giant Swarm
 * release of each installation, read live by the portal's backend in one
 * request (`GET /api/gs/installations/versions`).
 *
 * The lab's catalog has no installation entities, so the spec adds the lab's
 * own installation to the catalog's answer: the row is the fixture, the
 * cells are the lab's. The kind cluster's API server answers `/version`; it
 * runs no Giant Swarm management cluster, so its release is "—".
 *
 * With AGENTLAB_BROWSER_READ_INSTALLATION naming a second installation of
 * the lab's config that the backend cannot read as the person (a
 * `backendUrl` override), its row is read from the browser.
 *
 * The standalone agent-platform chart turns the Installations page off; the
 * suite is skipped with the reason until AGENTLAB_INSTALLATIONS_PAGE=1 says
 * the lab's Backstage names `page:gs/installations` in `app.extensions`.
 */
const BROWSER_READ_INSTALLATION =
  process.env.AGENTLAB_BROWSER_READ_INSTALLATION;

const installationEntity = (name: string) => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: {
    name,
    namespace: 'default',
    labels: { 'giantswarm.io/provider': 'kind' },
  },
  spec: { type: 'installation', owner: 'group:default/platform-admins' },
});
const INSTALLATIONS = [lab.installation, BROWSER_READ_INSTALLATION].filter(
  (name): name is string => Boolean(name),
);

const ENTITIES = '**/api/catalog/entities?*';
const TYPE_FACET = '**/api/catalog/entity-facets?facet=spec.type*';

test.describe('installations: management cluster versions', () => {
  test.skip(
    !process.env.AGENTLAB_INSTALLATIONS_PAGE,
    'needs a lab whose Backstage enables page:gs/installations (the standalone chart turns it off); set AGENTLAB_INSTALLATIONS_PAGE=1',
  );

  test.beforeEach(async ({ admin }) => {
    // The page's hidden type picker keeps `spec.type=installation` only
    // where the facet offers it; the table then lists the resources.
    await admin.route(TYPE_FACET, async route => {
      const response = await route.fetch();
      const body = await response.json();
      const facet = body.facets['spec.type'];
      if (!facet.some((f: { value: string }) => f.value === 'installation')) {
        facet.push({ value: 'installation', count: 1 });
      }
      await route.fulfill({ response, json: body });
    });
    await admin.route(ENTITIES, async route => {
      const url = decodeURIComponent(route.request().url());
      if (!url.includes('kind=resource')) {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      const entities: { metadata: { name: string } }[] = await response.json();
      for (const name of INSTALLATIONS) {
        if (!entities.some(e => e.metadata.name === name)) {
          entities.push(installationEntity(name));
        }
      }
      await route.fulfill({ response, json: entities });
    });
  });

  test.afterEach(async ({ admin }) => {
    await admin.unroute(TYPE_FACET);
    await admin.unroute(ENTITIES);
  });

  test('shows the Kubernetes version and the release of the installation', async ({
    admin,
  }) => {
    const versionRequests: string[] = [];
    const onRequest = (request: { url(): string }) => {
      if (request.url().includes('/api/gs/installations/versions')) {
        versionRequests.push(request.url());
      }
    };
    admin.on('request', onRequest);

    await open(admin, '/installations');
    await expect(
      admin.getByRole('columnheader', { name: 'Kubernetes version' }),
    ).toBeVisible({ timeout: 120_000 });
    await expect(
      admin.getByRole('columnheader', { name: 'Release' }),
    ).toBeVisible();

    const kubernetes = admin.getByTestId(
      `version-kubernetes-${lab.installation}`,
    );
    await expect(kubernetes).toHaveText(/^1\.\d+\.\d+/, { timeout: 120_000 });

    const release = admin.getByTestId(`version-release-${lab.installation}`);
    await expect(release).toBeVisible({ timeout: 120_000 });
    await expect(release).toHaveAttribute(
      'title',
      'The management cluster carries no Giant Swarm release',
    );

    // Both columns of every row come from one request.
    admin.off('request', onRequest);
    expect(versionRequests).toHaveLength(1);
  });

  test('never writes the person’s versions to the browser’s storage', async ({
    admin,
  }) => {
    await open(admin, '/installations');
    await expect(
      admin.getByTestId(`version-kubernetes-${lab.installation}`),
    ).toHaveText(/^1\.\d+\.\d+/, { timeout: 120_000 });
    // The persister writes on a throttle; give it time to.
    await admin.waitForTimeout(3_000);

    const stored = await admin.evaluate(() =>
      Object.keys(localStorage).map(key => localStorage.getItem(key) ?? ''),
    );
    expect(
      stored.filter(value => value.includes('management-cluster-versions')),
    ).toEqual([]);
  });

  test('reads in the browser an installation the backend leaves to it', async ({
    admin,
  }) => {
    test.skip(
      !BROWSER_READ_INSTALLATION,
      'needs AGENTLAB_BROWSER_READ_INSTALLATION: an installation of the lab config with a backendUrl override',
    );
    const answer = admin.waitForResponse(response =>
      response.url().includes('/api/gs/installations/versions'),
    );
    await open(admin, '/installations');
    const body = await (await answer).json();
    expect(body.readInBrowser).toContain(BROWSER_READ_INSTALLATION);
    expect(body.installations[lab.installation]).toBeDefined();

    await expect(
      admin.getByTestId(`version-kubernetes-${BROWSER_READ_INSTALLATION}`),
    ).toHaveText(/^1\.\d+\.\d+/, { timeout: 120_000 });
  });

  test('finds the installation by its Kubernetes version in the search', async ({
    admin,
  }) => {
    await open(admin, '/installations');
    const kubernetes = admin.getByTestId(
      `version-kubernetes-${lab.installation}`,
    );
    await expect(kubernetes).toHaveText(/^1\.\d+\.\d+/, { timeout: 120_000 });
    const minor = (await kubernetes.innerText()).trim().split('.', 2).join('.');

    const search = admin.getByPlaceholder('Filter');
    await search.fill(`${minor}.`);
    await expect(kubernetes).toBeVisible();
    await search.fill('0.0.0-no-such-version');
    await expect(kubernetes).toHaveCount(0);
  });
});
