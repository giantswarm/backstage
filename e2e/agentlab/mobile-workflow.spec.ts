import {
  connectToMuster,
  expect,
  expectNoHorizontalScroll,
  open,
  test,
} from './fixtures';
import { lab } from './lab';

/**
 * A workflow on a phone (wave 3B, B18): no canvas to pan, but the step list —
 * an ordered list of step cards built from the same graph, each opening its
 * details in place — so a swipe always scrolls the page. On the lab's
 * read-only `lab-cluster-overview` workflow (namespaces, then pods, through
 * mcp-kubernetes).
 */

const WORKFLOW = 'lab-cluster-overview';

test('a workflow reads as a list of steps that take a tap, the page never scrolling sideways', async ({
  admin,
}) => {
  // Smoke-level on purpose: the step details are being reworked (T88), so
  // this pins what survives it — the page, its steps in order as cards a
  // swipe scrolls past (no canvas to pan at phone width), a step that takes
  // a tap, and no sideways page scroll.
  await open(
    admin,
    `/agent-platform/workflows/${WORKFLOW}?installation=${lab.installation}`,
  );
  await expect(
    admin.getByRole('heading', { level: 1, name: WORKFLOW }),
  ).toBeVisible();
  const steps = admin
    .getByRole('main')
    .getByRole('button', { name: /^Step \d+:/ });
  await expect(steps.first()).toBeVisible({ timeout: 60_000 });
  expect(await steps.count()).toBeGreaterThanOrEqual(2);
  await expectNoHorizontalScroll(admin, 'workflow page');
  await steps.first().click();
  await expect(
    admin.getByText(/something went wrong|error boundary/i),
  ).toBeHidden();
  await expectNoHorizontalScroll(admin, 'workflow page, a step opened');
});

test('a workflow runs from its Run it tab on a phone, form and result never scrolling the page sideways', async ({
  admin,
}) => {
  test.setTimeout(150_000);
  await open(
    admin,
    `/agent-platform/workflows/${WORKFLOW}/run?installation=${lab.installation}`,
  );
  const run = admin
    .getByRole('main')
    .getByRole('button', { name: 'Run', exact: true });
  await connectToMuster(admin, run);
  await expect(run).toBeVisible({ timeout: 60_000 });
  await expectNoHorizontalScroll(admin, "a workflow's Run it tab");
  await run.click();
  await expect(
    admin.getByRole('heading', { level: 2, name: 'Result', exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  await expectNoHorizontalScroll(
    admin,
    "a workflow's Run it tab with its result",
  );
});
