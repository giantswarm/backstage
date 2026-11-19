import {
  expect,
  expectWizardStep,
  open,
  openWizardMoreOptions,
  test,
} from './fixtures';
import { lab } from './lab';

const MODEL = 'claude-sonnet-label-check';

for (const displayName of [undefined, 'Fast and cheap']) {
  test(`a person with namespaced access sees the ${displayName ? 'display name' : 'model ID'} in the New agent wizard`, async ({
    signInAs,
  }) => {
    const dev = await signInAs(lab.users.dev);
    await dev.addInitScript(() => {
      localStorage.removeItem('agent-platform-react-query-cache');
      localStorage.removeItem('gs-react-query-cache');
    });
    await dev.route('**/api/kubernetes/proxy/**/modelconfigs*', async route => {
      const response = await route.fetch();
      if (!response.ok()) {
        await route.fulfill({ response });
        return;
      }
      const body = await response.json();
      for (const item of body.items ?? []) {
        if (item.metadata.name === lab.defaultModel) {
          item.spec.model = MODEL;
          item.metadata.annotations ??= {};
          delete item.metadata.annotations['ui.giantswarm.io/display-name'];
          if (displayName) {
            item.metadata.annotations['ui.giantswarm.io/display-name'] =
              displayName;
          }
        }
      }
      await route.fulfill({ response, json: body });
    });
    await open(dev, '/customize/agents/new', lab.users.dev);
    await expectWizardStep(dev, 'Details');

    const label = displayName ?? MODEL;
    await expect(
      dev.getByText(`Runs on ${label}`, { exact: false }),
    ).toBeVisible({ timeout: 60_000 });
    await openWizardMoreOptions(dev);
    const models = dev.getByRole('radiogroup', { name: 'Model' });
    const platformDefault = models.getByRole('radio', {
      name: `Select model ${label}, default`,
      exact: true,
    });
    await expect(platformDefault).toBeVisible({ timeout: 60_000 });
    await expect(platformDefault).toHaveAttribute('aria-checked', 'true');
    await expect(platformDefault).toContainText('Anthropic');
    expect((await platformDefault.innerText()).split(MODEL)).toHaveLength(2);
    await expect(dev.getByText(/^Preselected:/)).toContainText(
      `Preselected: ${label},`,
    );
    await expect(
      dev.getByRole('button', {
        name: `Model details for ${label}`,
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      dev.getByText(/^Could not read (models|\d+ environments?)$/),
    ).toHaveCount(0);
  });
}
