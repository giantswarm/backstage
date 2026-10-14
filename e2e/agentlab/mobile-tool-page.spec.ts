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
 * tool's own page, and that page — its form, then a result as wide as a
 * kubernetes list — never scrolling sideways. On muster's own read-only
 * `core_mcpserver_list`, there on every muster, and the lab's kubernetes
 * family.
 */

const scope = `?installation=${lab.installation}`;

test("a connector's tools are rows that open a page of their own, where a tool runs, the page never scrolling sideways", async ({
  admin,
}) => {
  test.setTimeout(120_000);
  await open(admin, `/agent-platform/connectors/kubernetes${scope}`);
  const list = admin.getByRole('list', { name: 'Tools', exact: true });
  await connectToMuster(admin, list);
  await expect(
    list.getByRole('link', { name: 'list', exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expectNoHorizontalScroll(admin, "a connector's Tools tab");

  await open(
    admin,
    `/agent-platform/connectors/muster/tools/core_mcpserver_list${scope}`,
  );
  await expect(
    admin.getByRole('heading', { level: 1, name: 'mcpserver_list' }),
  ).toBeVisible();
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
