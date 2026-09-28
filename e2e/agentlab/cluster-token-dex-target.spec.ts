import { expect, test } from './fixtures';
import { lab } from './lab';

/**
 * An installation reached through its own Dex instead of muster
 * (`gs.clusterTokenBroker.targets.<installation>`, docs/configuration.md,
 * "Without muster: a Dex target per installation"). The default lab has no
 * such target: set `AGENTLAB_DEX_TARGET` to the installation a lab adds one
 * for, with a second Dex that trusts the lab Dex as its issuer.
 */
const target = process.env.AGENTLAB_DEX_TARGET;

test.describe('a Dex target installation', () => {
  test.skip(
    !target,
    'AGENTLAB_DEX_TARGET is not set: the lab has no Dex target',
  );

  test('is connected through the main login alone', async ({ admin }) => {
    const minted = admin.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/api/auth/cluster-token/${target}`),
      { timeout: 60_000 },
    );
    await admin.goto('/');
    const response = await minted;
    expect(response.status(), 'the portal mints its token at its Dex').toBe(
      200,
    );
    const { expiresInSeconds } = await response.json();
    expect(expiresInSeconds).toBeGreaterThan(0);

    await admin.goto('/settings/auth-providers');
    const providers = admin.getByRole('listitem');
    await expect(
      providers.filter({ hasText: `installation "${lab.installation}"` }),
      'the main login keeps its entry',
    ).toBeVisible();
    await expect(
      providers.filter({ hasText: `installation "${target}"` }),
      'a covered installation has no sign-in entry of its own',
    ).toHaveCount(0);
  });
});
