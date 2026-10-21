import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  expectAgentRendered,
  test,
} from './fixtures';

/**
 * A TLS service in an agent's Extra egress origins: the wizard refuses a
 * `tls://` entry without a port, naming why, takes one with a port, and the
 * agent agent-manager creates carries it in `spec.egress`, listed on its
 * Configuration card. The create is the lab's own: agent-manager's dry run and
 * `create_agent` through muster as the lab admin, the Agent rendered by Flux.
 */

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const agentName = `E2E Egress TLS ${stamp}`;
const agentSlug = `e2e-egress-tls-${stamp}`;
const TLS_ORIGIN = 'tls://db.example.com:5432';

test('agent egress: a tls:// service needs a port and lands on the Configuration card', async ({
  admin,
}) => {
  test.setTimeout(10 * 60_000);

  const detailPath = await createAgentInWizard(admin, agentName, agentSlug, {
    onStep: async step => {
      if (step === 'Details') {
        const egress = admin.getByRole('textbox', {
          name: /^Extra egress origins/,
        });
        await egress.fill('tls://db.example.com');
        await egress.blur();
        await expect(egress).toHaveAttribute('aria-invalid', 'true');
        await expect(
          admin
            .getByText(
              '"tls://db.example.com" has no port: a tls:// origin requires one',
              { exact: false },
            )
            .first(),
        ).toBeVisible();
        await egress.fill(TLS_ORIGIN);
        await expect(egress).not.toHaveAttribute('aria-invalid', 'true');
      }
      if (step === 'Review') {
        await expect(admin.getByText(TLS_ORIGIN).first()).toBeVisible();
      }
    },
  });

  let failure: unknown;
  try {
    await expectAgentRendered(admin);
    // The Configuration card sits under the page's Technical details fold-out.
    const foldOut = admin.getByRole('button', { name: 'Technical details' });
    if ((await foldOut.getAttribute('aria-expanded')) !== 'true') {
      await foldOut.click();
    }
    const card = admin
      .getByRole('heading', { name: 'Configuration', exact: true })
      .locator('xpath=ancestor::*[.//dt][1]');
    await expect(card.getByText('Extra egress')).toBeVisible();
    await expect(
      card.getByText(TLS_ORIGIN, { exact: true }),
      'the Configuration card lists the tls:// service under Extra egress',
    ).toBeVisible({ timeout: 60_000 });
  } catch (error) {
    failure = error;
  }
  await deleteAgentInPortal(admin, detailPath, agentSlug);
  if (failure !== undefined) {
    throw failure;
  }
});
