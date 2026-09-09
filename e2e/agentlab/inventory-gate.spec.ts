import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The installation-inventory gate: the Agent Platform tabs decide which
 * installations to read from a `GET /apis` probe through each installation's
 * Kubernetes API. When the API server refuses that probe (a 401: the person's
 * token carries no audience it accepts; a 403), the muster section, the Agents
 * tab and the Sessions tab say so once — which installation, what it answered,
 * and the remedy — instead of listing nothing.
 *
 * The refusal itself needs a lab whose portal asks Dex for no audience the
 * apiserver accepts: drop `audience:server:client_id:kubernetes` from the
 * lab's `backstage.extraScopes` (a `platform.valuesFiles` overlay), roll the
 * portal and run with `AGENTLAB_INVENTORY_REFUSED=1`. Against a healthy lab
 * only the negative runs: the gate is absent and the dashboard renders.
 */

const dashboardPath = '/agent-platform/muster/dashboard';
/** The sentence the gate opens with for a 401 (`inventoryFailureCopy`). */
const rejectedToken = /rejected the portal's token/;

test('with a token the API server accepts, the muster dashboard renders without the inventory gate', async ({
  admin,
}) => {
  await open(admin, dashboardPath);
  await expect(
    admin.getByText('Fleet coverage'),
    'the dashboard renders its CRD-backed section',
  ).toBeVisible();
  await expect(admin.getByText(rejectedToken)).toHaveCount(0);
});

test.describe('an installation whose inventory probe the API server refused', () => {
  test.skip(
    !process.env.AGENTLAB_INVENTORY_REFUSED,
    'needs a lab whose portal requests no audience the apiserver accepts (AGENTLAB_INVENTORY_REFUSED=1)',
  );

  test('the muster section and the Agents tab show the gate naming the installation, the 401 and Sign out, and the probe is not re-run per mount', async ({
    signInAs,
  }) => {
    const page = await signInAs(lab.users.dev);
    const probes: number[] = [];
    page.on('response', response => {
      if (
        new URL(response.url()).pathname.endsWith('/api/kubernetes/proxy/apis')
      ) {
        probes.push(response.status());
      }
    });

    await page.goto(dashboardPath);
    const gate = page.getByText(rejectedToken);
    await expect(gate, 'the section explains the refused probe').toBeVisible();
    await expect(gate).toContainText(lab.installation);
    await expect(gate).toContainText('401');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(
      page.getByText('No muster installation'),
      'the views are replaced by the gate, not shown next to it',
    ).toHaveCount(0);

    // One rejected token used to show up as ten `401 GET /apis` per page
    // load: every mount of the inventory hook re-ran the failed probe.
    await page.waitForTimeout(3_000);
    expect(
      probes.every(status => status === 401),
      'the probe was refused',
    ).toBe(true);
    expect(
      probes.length,
      'the refused probe is not re-run on every mount of the hook',
    ).toBeLessThanOrEqual(3);

    await page.goto('/agent-platform/agents');
    await expect(
      page.getByText(rejectedToken),
      'the Agents tab explains the same refusal',
    ).toBeVisible();

    // Sign out is the remedy for a 401: a silent refresh cannot repair the
    // token, a fresh sign-in requests the scopes the configuration now asks for.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });
});
