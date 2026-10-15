import { expect, expectWizardStep, open, test } from './fixtures';

/**
 * When the Agent Platform's forms show a field's error (the `forms` skill,
 * giantswarm/giantswarm#38519): not while the person first types, on leaving
 * a field they typed in, never for an empty field they only tabbed through,
 * cleared the moment the value is fixed, and every error on a blocked
 * Continue with the focus on the first. Proven on the agent wizard's Details
 * step and the connector wizard's Connect step; nothing is created.
 */

test('agent wizard: an empty Name tabbed through stays quiet until Continue', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/agents/new');
  await expectWizardStep(admin, 'Details');
  const name = admin.getByRole('textbox', { name: 'Name', exact: true });

  await name.focus();
  await admin.keyboard.press('Tab');
  await expect(name).not.toHaveAttribute('aria-invalid', 'true');
  await expect(admin.getByText('Enter a name for the agent.')).toHaveCount(0);

  await admin.getByRole('button', { name: 'Continue' }).first().click();
  await expectWizardStep(admin, 'Details');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toBeFocused();

  await name.fill('E2E Form Validation');
  await expect(name).not.toHaveAttribute('aria-invalid', 'true');
});

test('connector wizard: the address is checked on leaving it and cleared once fixed', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/connectors/new');
  const address = admin.getByRole('textbox', {
    name: 'Server address',
    exact: true,
  });

  await address.pressSequentially('mcp.example.com');
  await expect(
    address,
    'no error while the address is typed',
  ).not.toHaveAttribute('aria-invalid', 'true');

  await admin.keyboard.press('Tab');
  await expect(address).toHaveAttribute('aria-invalid', 'true');
  await expect(
    admin.getByText(/Server address must be an http\(s\) URL/),
  ).toBeVisible();

  await address.fill('https://mcp.example.com/mcp');
  await expect(address).not.toHaveAttribute('aria-invalid', 'true');
  await expect(
    admin.getByText(/Server address must be an http\(s\) URL/),
  ).toHaveCount(0);
});
