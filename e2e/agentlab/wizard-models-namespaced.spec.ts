import {
  expect,
  expectWizardStep,
  open,
  openWizardMoreOptions,
  test,
} from './fixtures';
import { lab } from './lab';

/**
 * The New agent wizard offers the ModelConfigs of the namespaces a person may
 * read. The lab's developer reads kagent only through the chart's namespaced
 * `agent-platform:user` RoleBinding in `kagent`, so a cluster-wide list is
 * forbidden to them; the wizard reads the namespace instead and offers its
 * models, with no "Could not read" notice.
 */
test('a person with a namespaced kagent RoleBinding picks a model in the New agent wizard', async ({
  signInAs,
}) => {
  const dev = await signInAs(lab.users.dev);
  await open(dev, '/agent-platform/agents/new', lab.users.dev);
  await expectWizardStep(dev, 'Details');

  await expect(
    dev.getByText('Runs on default-model-config'),
    'the platform default is preselected from the kagent namespace',
  ).toBeVisible({ timeout: 60_000 });
  await openWizardMoreOptions(dev);
  const models = dev.getByRole('radiogroup', { name: 'Model' });
  const platformDefault = models.getByRole('radio', {
    name: /default-model-config/,
  });
  await expect(
    platformDefault,
    'the ModelConfigs of the kagent namespace are offered',
  ).toBeVisible({ timeout: 60_000 });
  await platformDefault.check();
  await expect(platformDefault).toBeChecked();

  await expect(
    dev.getByText(/^Could not read (models|\d+ environments?)$/),
    'neither the models nor an environment read as unreadable',
  ).toHaveCount(0);
});
