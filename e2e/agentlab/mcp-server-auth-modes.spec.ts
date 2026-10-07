import { connectToMuster, expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * An MCP server's auth mode has one name wherever the portal shows it: the
 * servers table's Auth column and the server page's Authentication card name
 * the lab's OAuth fixture (`auth.type: oauth`, its own authorization server)
 * the same way.
 */

const OWN_ACCOUNT = 'Own account (OAuth sign-in)';

test('MCP servers: the servers table and the server page name the auth mode alike', async ({
  admin,
}) => {
  await open(
    admin,
    `/agent-platform/mcp-servers?installation=${lab.installation}`,
  );
  await connectToMuster(admin, admin.getByRole('grid'));

  const fixture = admin.getByRole('link', { name: /^lab-oauth-fixture/ });
  await expect(
    admin.getByRole('row').filter({ has: fixture }),
    'the Auth column names the fixture by its mode',
  ).toContainText(OWN_ACCOUNT);

  await fixture.click();
  await admin.getByRole('tab', { name: 'Details' }).click();
  await expect(
    admin.getByText(OWN_ACCOUNT, { exact: true }),
    'the Authentication card names the same mode',
  ).toBeVisible({ timeout: 60_000 });
});
