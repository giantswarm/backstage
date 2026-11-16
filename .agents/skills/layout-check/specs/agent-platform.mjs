/*
 * Every Agent Platform and muster page of the shell, in fixture mode's base
 * data set, with the states that broke layouts before: the Sort picker of
 * the Agents tab (giantswarm/backstage#3513) and the New session dialog with
 * toolchains picked (giantswarm/backstage#3498).
 *
 *   node .agents/skills/layout-check/layout-check.mjs --spec .agents/skills/layout-check/specs/agent-platform.mjs
 */

/**
 * Opens the first record of the list the page shows: its link under
 * `prefix`, or the first row of its table. `suffix` goes after the record's
 * path (a tab, `/edit`).
 */
const openFirst =
  (prefix, suffix = '') =>
  async ({ page }) => {
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
    const before = page.url();
    await page.locator('tbody [role=row]').first().click();
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
  run: async ({ page }) => {
    await page.locator('button[aria-label="Sort agents"]').click();
    await page.getByRole('option', { name: value, exact: true }).click();
  },
});

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
        run: async ({ page }) => {
          await page.getByRole('button', { name: 'Use this agent' }).click();
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
  { name: 'Connect a model', path: '/customize/models/new' },
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

/** The first tool of the first connector that lists tools ("23 tools"). */
function openFirstTool(tab) {
  return async ({ page }) => {
    // A table row, or on a phone a list item, that counts its tools.
    const row = page
      .locator('tbody [role=row], li')
      .filter({ hasText: /[1-9]\d*\s*tools/ })
      .first();
    const link = row.locator('a[href^="/customize/connectors/"]');
    if (await link.count()) {
      await page.goto(new URL(await link.first().getAttribute('href'), page.url()).href);
    } else {
      const list = page.url();
      await row.click();
      await page.waitForURL(url => url.href !== list);
    }
    await page.locator('a[href*="/tools/"]').first().waitFor();
    const tool = page.locator('a[href*="/tools/"]').first();
    const href = await tool.getAttribute('href');
    await page.goto(new URL(href.split('?')[0] + tab, page.url()).href);
  };
}
