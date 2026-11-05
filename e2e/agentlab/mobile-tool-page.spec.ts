import {
  connectToMuster,
  expect,
  expectNoHorizontalScroll,
  open,
  test,
} from './fixtures';
import { lab } from './lab';

/**
 * A connector's tools on a phone: the Tools tab a list of rows that open each
 * tool's own page, and that page's tabs — Overview, Run it with its form and
 * a result as wide as a kubernetes list, and Usage — never scrolling
 * sideways. On muster's own read-only `core_mcpserver_list`, there on every
 * muster, and the lab's kubernetes family.
 */

/** The lab installation's connector pages. */
const connectors = `/customize/connectors/${lab.installation}`;

test("a connector's tools are rows that open a page of their own, where a tool runs, the page never scrolling sideways", async ({
  admin,
}) => {
  test.setTimeout(120_000);
  await open(admin, `${connectors}/kubernetes`);
  const list = admin.getByRole('list', { name: 'Tools', exact: true });
  await connectToMuster(admin, list);
  await expect(
    list.getByRole('link', { name: 'list', exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expectNoHorizontalScroll(admin, "a connector's Tools tab");

  await open(admin, `${connectors}/muster/tools/core_mcpserver_list`);
  await expect(
    admin.getByRole('heading', { level: 1, name: 'mcpserver_list' }),
  ).toBeVisible();
  const overview = admin.getByRole('region', { name: 'What it’s for' });
  await connectToMuster(admin, overview);
  await expect(overview).toBeVisible({ timeout: 60_000 });
  await expectNoHorizontalScroll(admin, "a tool's Overview");

  await admin.getByRole('tab', { name: 'Run it', exact: true }).click();
  const run = admin.getByRole('button', { name: 'Run', exact: true });
  await connectToMuster(admin, run);
  // The form, not the skeleton drawn while the tool is described.
  await expect(run).toBeVisible({ timeout: 60_000 });
  await expectNoHorizontalScroll(admin, "a tool's page");
  await run.click();
  await expect(
    admin.getByRole('heading', { level: 2, name: 'Result', exact: true }),
    'the tool ran through the call proxy',
  ).toBeVisible({ timeout: 60_000 });
  await expectNoHorizontalScroll(admin, "a tool's page with its result");
});

test("a kubernetes tool's Usage tab fits the phone", async ({ admin }) => {
  test.setTimeout(120_000);
  await open(admin, `${connectors}/kubernetes`);
  const list = admin.getByRole('list', { name: 'Tools', exact: true });
  await connectToMuster(admin, list);
  const tool = list.getByRole('link', { name: 'list', exact: true });
  await expect(tool).toBeVisible({ timeout: 60_000 });
  await tool.click();
  await admin.getByRole('tab', { name: 'Usage', exact: true }).click();
  const intro = admin.getByText(
    `Every caller's calls to this tool over the last 30 days on ${lab.installation}.`,
    { exact: true },
  );
  const unavailable = admin.getByText(
    /^Usage metrics are not available for this environment:/,
  );
  await expect(intro.or(unavailable)).toBeVisible({ timeout: 60_000 });
  await expectNoHorizontalScroll(admin, "a tool's Usage tab");
});

test("a connector's Usage tab fits the phone: tiles, chart and tables never scroll the page sideways", async ({
  admin,
}) => {
  test.setTimeout(120_000);
  await open(admin, `${connectors}/kubernetes/usage`);
  await expect(
    admin.getByRole('tab', { name: 'Usage', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  const intro = admin.getByText(
    `Every caller's tool calls to this connector over the last 30 days on ${lab.installation}.`,
    { exact: true },
  );
  const unavailable = admin.getByText(
    /^Usage metrics are not available for this environment:/,
  );
  await connectToMuster(admin, intro.or(unavailable));
  await expect(intro.or(unavailable)).toBeVisible({ timeout: 60_000 });
  if (await intro.isVisible()) {
    // A table keeps the name and Calls; errors and p95 go under the name.
    const tables = admin.getByRole('grid');
    if (await tables.count()) {
      await expect(tables.first().getByRole('columnheader')).toHaveText([
        'Tool',
        'Calls',
      ]);
    }
  }
  await expectNoHorizontalScroll(admin, "a connector's Usage tab");
});
