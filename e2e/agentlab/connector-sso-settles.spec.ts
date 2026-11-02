import { connectToMuster, expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * Right after a sign-in muster connects the person's company-login
 * connectors in the background: the Connectors table says so ("Connecting")
 * and reads the status again until the connect settled, so a company-login
 * connector reaches Connected without a reload and never asks for a sign-in
 * that is under way.
 */

test('Connectors: a company-login connector settles to Connected without a reload, never Sign in needed', async ({
  admin,
}) => {
  await open(
    admin,
    `/customize/connectors/internal?installation=${lab.installation}`,
  );
  await connectToMuster(admin, admin.getByRole('grid'));

  const row = admin.getByRole('row', { name: /^Agent Manager/ });
  await expect(
    row.getByRole('gridcell', { name: 'Company login' }),
    'Agent Manager is reached with the portal sign-in',
  ).toBeVisible({ timeout: 60_000 });

  let askedSignIn = false;
  await expect
    .poll(
      async () => {
        if (await row.getByText('Sign in needed').isVisible()) {
          askedSignIn = true;
        }
        return (await row.getByText('Connected', { exact: true }).isVisible())
          ? 'connected'
          : 'waiting';
      },
      {
        timeout: 30_000,
        intervals: [250],
        message: 'the row did not reach Connected without a reload',
      },
    )
    .toBe('connected');
  expect(askedSignIn, 'the row never asked for a sign-in').toBe(false);
});
