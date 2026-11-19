/*
 * Every Agent Platform and muster page of the shell, in any of fixture
 * mode's scenarios, with the states that broke layouts before: the Sort picker of
 * the Agents tab (giantswarm/backstage#3513) and the New session dialog with
 * toolchains picked (giantswarm/backstage#3498).
 *
 *   node .agents/skills/layout-check/layout-check.mjs --spec .agents/skills/layout-check/specs/agent-platform.mjs
 *
 * A page whose record or picker a scenario lacks (nothing to open in
 * `empty`, `loading` or `error`) is skipped, not failed.
 */
import { readFileSync } from 'node:fs';

/**
 * The segment that starts an organization connector's address, read from
 * its one definition in the muster plugin (`lib/connectorAddress.ts`), which
 * this module, run by Node, cannot import.
 */
const ORGANIZATION_CONNECTOR_SEGMENT = (() => {
  const source = readFileSync(
    new URL(
      '../../../../plugins/muster/src/lib/connectorAddress.ts',
      import.meta.url,
    ),
    'utf8',
  );
  const match = /export const ORGANIZATION_CONNECTOR_SEGMENT = '([^']+)'/.exec(
    source,
  );
  if (!match) {
    throw new Error('ORGANIZATION_CONNECTOR_SEGMENT not found in muster');
  }
  return match[1];
})();

/** Whether `locator` shows up within `ms`. */
const shows = (locator, ms = 5000) =>
  locator
    .first()
    .waitFor({ timeout: ms })
    .then(
      () => true,
      () => false,
    );

/**
 * Opens the first record of the list the page shows: its link under
 * `prefix`, or the first row of its table. `suffix` goes after the record's
 * path (a tab, `/edit`).
 */
const openFirst =
  (prefix, suffix = '') =>
  async ({ page, skip }) => {
    const href = await page.evaluate(
      p =>
        [...document.querySelectorAll('a[href]')]
          .map(a => a.getAttribute('href'))
          .find(
            h =>
              h.startsWith(p) &&
              h.length > p.length &&
              !/\/new(\/|$)/.test(h.slice(p.length - 1)),
          ),
      prefix,
    );
    if (href) {
      await page.goto(new URL(href.split('?')[0] + suffix, page.url()).href);
      return;
    }
    const rows = page.locator('tbody [role=row]');
    if (!(await shows(rows))) {
      skip(`no record under ${prefix} to open`);
    }
    const before = page.url();
    await rows.first().click();
    await page.waitForURL(url => url.href !== before);
    if (suffix) {
      await page.goto(new URL(page.url().split('?')[0] + suffix).href);
    }
  };

/** A record's page and its tabs, each reached through the list. */
const record = (name, list, prefix, tabs) =>
  tabs.map(tab => ({
    name: `${name}${tab ? ` ${tab}` : ''}`,
    path: list,
    setup: openFirst(prefix, tab),
  }));

/** Picks each value of the Agents tab's Sort picker in turn. */
const sortBy = value => ({
  name: `Sort: ${value}`,
  run: async ({ page, skip }) => {
    const sort = page.locator('button[aria-label="Sort agents"]');
    if (!(await shows(sort))) skip('no Sort picker: no agents listed');
    await sort.click();
    await page.getByRole('option', { name: value, exact: true }).click();
  },
});

/** Turns on every column of the Platform section's clusters list. */
const everyClusterColumn = {
  name: 'every column',
  run: async ({ page, skip }) => {
    const button = page.locator('button[aria-label="Columns"]');
    if (!(await shows(button))) skip('no column picker: no clusters listed, or phone width');
    await button.click();
    const group = page.getByRole('group', { name: 'Columns' });
    await group.waitFor();
    // The inputs sit under bui's drawn box: check them, not click them.
    for (const box of await group.getByRole('checkbox').all()) {
      if (!(await box.isChecked()) && !(await box.isDisabled())) {
        await box.check({ force: true });
      }
    }
    await page.keyboard.press('Escape');
    const headers = page.getByRole('columnheader');
    if ((await headers.count()) !== (await group.getByRole('checkbox').count())) {
      throw new Error('the column picker did not show every column');
    }
  },
};

/**
 * Opens a cluster's page from the Platform section's list, at any width: the
 * first ready workload cluster, the first management cluster (in `org-giantswarm`) or
 * the first one being deleted, by its row's link and text.
 */
const openCluster = kind => async ({ page, skip }) => {
  // Table rows, or on a phone the stacked list's items.
  const rows = page.locator('tbody [role=row], li:has(a[href^="/platform/clusters/"])');
  if (!(await shows(rows))) skip('no clusters listed');
  // Management clusters are named after their environment and can sort past
  // the first page: the search finds them by their organization.
  const search = page.getByRole('searchbox', { name: 'Search clusters' });
  if (kind === 'management' && (await shows(search, 2000))) {
    await search.fill('giantswarm');
  }
  // Environments answer one by one: wait until a row of the kind is listed.
  const handle = await page
    .waitForFunction(want => {
    for (const row of document.querySelectorAll('tbody [role=row], li')) {
      const href = row
        .querySelector('a[href^="/platform/clusters/"]')
        ?.getAttribute('href');
      if (!href) continue;
      const text = row.textContent ?? '';
      const management = href.includes('/org-giantswarm/');
      if (
        (want === 'management' && management) ||
        (want === 'deleting' && text.includes('Deleting')) ||
        (want === 'workload' && !management && text.includes('Ready'))
      ) {
        return href;
      }
    }
    return undefined;
  }, kind, { timeout: 15000 })
    .catch(() => undefined);
  const href = handle ? await handle.jsonValue() : undefined;
  if (!href) skip(`no ${kind} cluster on the list's first page`);
  await page.goto(new URL(href, page.url()).href);
};

export default [
  { name: 'Home', path: '/' },
  { name: 'Sessions', path: '/sessions' },
  {
    name: 'Session',
    path: '/sessions',
    setup: openFirst('/sessions/'),
  },
  {
    name: 'Agents',
    path: '/customize/agents',
    states: [sortBy('Last used'), sortBy('Recently added'), sortBy('Name')],
  },
  ...record('Agent', '/customize/agents', '/customize/agents/', [
    '',
    '/sessions',
    '/tools',
    '/usage',
    '/edit',
  ]),
  {
    name: 'New session dialog with toolchains',
    path: '/customize/agents',
    setup: openFirst('/customize/agents/'),
    states: [
      {
        name: 'dialog open',
        run: async ({ page, skip }) => {
          const use = page.getByRole('button', { name: 'Use this agent' });
          if (!(await shows(use))) skip('the agent offers no Use this agent');
          await use.click();
          await page.getByRole('dialog').waitFor();
        },
      },
      {
        name: 'every toolchain picked',
        run: async ({ page }) => {
          const dialog = page.getByRole('dialog');
          await dialog.getByRole('button', { name: /^Toolchains/ }).click();
          const popover = page.getByRole('dialog').last();
          // bui's checkbox hides its input: press its label.
          for (const label of await popover.locator('label.bui-Checkbox').all()) {
            if (!(await label.getByRole('checkbox').isChecked())) {
              await label.click();
            }
          }
          await page.keyboard.press('Escape');
        },
      },
    ],
  },
  { name: 'New agent', path: '/customize/agents/new' },
  { name: 'Skills', path: '/customize/skills' },
  ...record('Skill', '/customize/skills', '/customize/skills/', [
    '',
    '/instructions',
    '/used-by',
  ]),
  { name: 'Add skill', path: '/customize/skills/new' },
  { name: 'Connectors', path: '/customize/connectors' },
  ...record('Connector', '/customize/connectors', '/customize/connectors/', [
    '',
    '/resources',
    '/prompts',
    '/usage',
    '/used-by',
    '/instances',
    '/details',
  ]),
  // An organization's connector, at `<inst>/-/<namespace>/<name>`.
  ...record(
    'Organization connector',
    '/customize/connectors',
    '/customize/connectors/',
    ['', '/details'],
  ).map(p => ({ ...p, setup: openFirstOrganizationConnector(p.name) })),
  {
    name: 'Organization connector tool',
    path: '/customize/connectors',
    setup: async step => {
      await openFirstOrganizationConnector('')(step);
      const { page, skip } = step;
      if (!(await shows(page.locator('a[href*="/tools/"]'), 10000))) {
        skip('the connector shows no tools');
      }
      const href = await page
        .locator('a[href*="/tools/"]')
        .first()
        .getAttribute('href');
      await page.goto(new URL(href.split('?')[0], page.url()).href);
    },
  },
  // An organization connector's address of its name alone, where several
  // organizations have a connector of that name: the list of them.
  {
    name: 'Connectors of one name',
    path: '/customize/connectors',
    setup: async ({ page, skip }) => {
      const href = await page.evaluate(segment => {
        const keys = [...document.querySelectorAll('a[href]')]
          .map(a => a.getAttribute('href').split('?')[0].split('/'))
          // ['', 'customize', 'connectors', inst, segment, namespace, name]
          .filter(p => p.length === 7 && p[2] === 'connectors' && p[4] === segment)
          .map(p => `/customize/connectors/${p[3]}/${p[6]}`);
        return keys.find((k, i) => keys.indexOf(k) !== i);
      }, ORGANIZATION_CONNECTOR_SEGMENT);
      if (!href) skip('no two organizations share a connector name');
      await page.goto(new URL(href, page.url()).href);
    },
  },
  ...['', '/run', '/usage'].map(tab => ({
    name: `Tool${tab ? ` ${tab}` : ''}`,
    path: '/customize/connectors',
    setup: openFirstTool(tab),
  })),
  { name: 'Add connector', path: '/customize/connectors/new' },
  { name: 'Models', path: '/customize/models' },
  ...record('Model', '/customize/models', '/customize/models/', [
    '',
    '/usage',
    '/used-by',
    '/edit',
  ]).map(p => ({ ...p, setup: openFirstModel(p.name) })),
  { name: 'Add a model', path: '/customize/models/new' },
  { name: 'Model hosting', path: '/customize/models/hosting' },
  { name: 'Hosting capacity', path: '/customize/models/hosting/capacity' },
  { name: 'Hosting cache', path: '/customize/models/hosting/cache' },
  { name: 'Serve a model', path: '/customize/models/hosting/serve' },
  { name: 'Import a model', path: '/customize/models/hosting/import' },
  { name: 'Pull a model', path: '/customize/models/hosting/pull' },
  { name: 'Add a backend', path: '/customize/models/hosting/add-backend' },
  { name: 'Add a pool', path: '/customize/models/hosting/capacity/add-pool' },
  { name: 'Workflows', path: '/customize/workflows' },
  ...record('Workflow', '/customize/workflows', '/customize/workflows/', [
    '',
    '/run',
    '/usage',
    '/details',
  ]),
  { name: 'Workspaces', path: '/customize/workspaces' },
  ...record('Workspace', '/customize/workspaces', '/customize/workspaces/', [
    '',
    '/sessions',
    '/details',
    '/edit',
  ]),
  { name: 'New workspace', path: '/customize/workspaces/new' },
  { name: 'Toolchains', path: '/customize/toolchains' },
  ...record('Toolchain', '/customize/toolchains', '/customize/toolchains/', ['']),
  { name: 'New toolchain', path: '/customize/toolchains/new' },
  { name: 'Usage', path: '/usage' },
  { name: 'Usage · Cost', path: '/usage/cost' },
  { name: 'Usage · Your sessions', path: '/usage/your-sessions' },
  { name: 'Usage · Connectors', path: '/usage/connectors' },
  { name: 'Profile', path: '/profile' },
  {
    name: 'Platform · Clusters',
    path: '/platform/clusters',
    states: [everyClusterColumn],
  },
  {
    name: 'Platform cluster',
    path: '/platform/clusters',
    setup: openCluster('workload'),
  },
  {
    name: 'Platform cluster · management',
    path: '/platform/clusters',
    setup: openCluster('management'),
  },
  {
    name: 'Platform cluster · deleting',
    path: '/platform/clusters',
    setup: openCluster('deleting'),
  },
];

/** A model's page: models are listed by installation, namespace and name, not under /hosting. */
function openFirstModel(name) {
  const tab = name.replace(/^Model ?/, '');
  return async step => {
    const { page } = step;
    const href = await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="/customize/models/"]')]
        .map(a => a.getAttribute('href'))
        .find(h => !/^\/customize\/models\/(new|hosting)(\/|$)/.test(h)),
    );
    if (href) {
      await page.goto(new URL(href.split('?')[0] + tab, page.url()).href);
      return;
    }
    await openFirst('/customize/models/', tab)(step);
  };
}

/**
 * The page of the first organization's connector the list links
 * (`<inst>/-/<namespace>/<name>`), with the tab `name` ends in.
 */
function openFirstOrganizationConnector(name) {
  const tab = /\/\w[\w-]*$/.exec(name)?.[0] ?? '';
  return async ({ page, skip }) => {
    const href = await page.evaluate(
      segment =>
        [...document.querySelectorAll('a[href]')]
          .map(a => a.getAttribute('href'))
          .find(h => h.startsWith('/customize/connectors/') && h.split('/')[4] === segment),
      ORGANIZATION_CONNECTOR_SEGMENT,
    );
    if (!href) skip("no organization's connector to open");
    await page.goto(new URL(href.split('?')[0] + tab, page.url()).href);
  };
}

/** The first tool of the first connector that lists tools ("23 tools"). */
function openFirstTool(tab) {
  return async ({ page, skip }) => {
    // A table row, or on a phone a list item, that counts its tools.
    const row = page
      .locator('tbody [role=row], li')
      .filter({ hasText: /[1-9]\d*\s*tools/ })
      .first();
    if (!(await shows(row))) skip('no connector lists tools');
    const link = row.locator('a[href^="/customize/connectors/"]');
    if (await link.count()) {
      await page.goto(new URL(await link.first().getAttribute('href'), page.url()).href);
    } else {
      const list = page.url();
      await row.click();
      await page.waitForURL(url => url.href !== list);
    }
    if (!(await shows(page.locator('a[href*="/tools/"]'), 10000))) {
      skip('the connector shows no tools');
    }
    const tool = page.locator('a[href*="/tools/"]').first();
    const href = await tool.getAttribute('href');
    await page.goto(new URL(href.split('?')[0] + tab, page.url()).href);
  };
}
