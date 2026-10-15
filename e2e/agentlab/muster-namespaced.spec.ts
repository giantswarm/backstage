import { connectToMuster, expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The muster section as a person who may not list muster's CRs
 * cluster-wide. The lab's developer holds only the chart's namespaced
 * `agent-platform:user` grants: the MCPServers of muster's namespace, no
 * Workflows. The section reads muster's namespace instead and shows the
 * servers, with no "Errors when trying to fetch resources" on Customize.
 */
const scope = `?installation=${lab.installation}`;
const fetchError = /Errors when trying to fetch resources/;

test('a person with only namespaced agent-platform:user grants sees the connectors, no 403', async ({
  signInAs,
}) => {
  const dev = await signInAs(lab.users.dev);
  await open(dev, `/customize/connectors/internal${scope}`, lab.users.dev);
  await connectToMuster(dev, dev.getByRole('grid'));
  await expect(
    dev.getByRole('row', { name: /^agent-manager( |$)/ }),
    'the servers of muster’s namespace are listed',
  ).toBeVisible({ timeout: 60_000 });
  await expect(dev.getByText(fetchError)).toHaveCount(0);

  await open(dev, `/customize/workflows${scope}`, lab.users.dev);
  await expect(
    dev
      .getByRole('grid')
      .or(dev.getByText(/workflow/i))
      .first(),
  ).toBeVisible({ timeout: 60_000 });
  await expect(dev.getByText(fetchError)).toHaveCount(0);
});
