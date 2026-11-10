import { expect, open, test } from './fixtures';
import { lab } from './lab';
import {
  KUBECONFIG,
  kubectl,
  labOrganizationNamespace,
  NEEDS_KUBECONFIG,
} from './kubectl';

/**
 * An organization's model key, entered on the Dev Portal's credential form
 * and never in a tool call (giantswarm/backstage#3364, agent-manager's
 * credential operations, giantswarm/agent-manager#312). The admin adds a
 * model on the organization's Models tab; agent-manager prepares a
 * credential request and the portal opens its form at
 * `credentials/<operation>`, which shows the organization and the model
 * before it takes the key. The key is saved through the portal's backend to
 * agent-manager as the person, lands in the Secret the ModelConfig names,
 * and is never shown back. The same link opened by another person is not
 * theirs: agent-manager binds the request to who prepared it.
 *
 * Needs the lab's agent-manager 2.22 with `credentials.uiURL` set to this
 * portal's `/organizations/<installation>/{parent}/{organization}/credentials/{operation}`,
 * `agentManager.route` on (the portal's backend reaches agent-manager there),
 * and the lab's first organization, `AGENTLAB_ORGANIZATION` as
 * `<parent>/<name>` (default `agentlab-organizations/default`), whose
 * `organization-admins` binds the admin's group.
 */

const { parent: PARENT, name: ORGANIZATION } = lab.organization;
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const MODEL = `e2e-cred-${stamp}`;
const SECRET = `tenant-credential-${MODEL}`;
const KEY = `sk-ant-e2e-${stamp}-never-shown`;
const BASE = `/organizations/${lab.installation}/${PARENT}/${ORGANIZATION}`;

async function organizationNamespace(): Promise<string> {
  const namespace = await labOrganizationNamespace();
  if (!namespace) {
    throw new Error(
      `the lab has no organization ${PARENT}/${ORGANIZATION} (AGENTLAB_ORGANIZATION)`,
    );
  }
  return namespace;
}

test('organization credentials: a model key is entered on the form, saved as the person and never shown back', async ({
  admin,
  signInAs,
}) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  test.setTimeout(6 * 60_000);
  const namespace = await organizationNamespace();
  expect(namespace, 'the lab has no such organization').not.toBe('');

  try {
    await open(admin, `${BASE}/models`);
    await admin.getByRole('button', { name: 'Add model' }).first().click();
    const dialog = admin.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /Name/ }).fill(MODEL);
    await dialog
      .getByRole('textbox', { name: /Model/ })
      .fill('claude-sonnet-4-6');
    await dialog.getByRole('button', { name: 'Continue to the key' }).click();

    await admin.waitForURL(new RegExp(`${BASE}/credentials/[a-f0-9]{48}$`));
    const formUrl = new URL(admin.url()).pathname;
    await expect(
      admin.getByText(`Model ${MODEL} (new)`, { exact: false }),
    ).toBeVisible();
    await expect(
      admin.getByText(
        new RegExp(`^${ORGANIZATION} · ${PARENT} · ${namespace}`),
      ),
    ).toBeVisible();

    // The request is bound to who prepared it: another person's link is gone.
    const dev = await signInAs(lab.users.dev);
    await open(dev, formUrl, lab.users.dev);
    await expect(dev.getByText('This request is gone')).toBeVisible();

    await admin.getByLabel(/^Value/).fill(KEY);
    await admin.getByRole('button', { name: 'Save' }).click();
    await expect(admin.getByText('Credential saved')).toBeVisible({
      timeout: 60_000,
    });
    expect(await admin.content()).not.toContain(KEY);
    expect(
      await admin.evaluate(() => JSON.stringify({ ...window.localStorage })),
    ).not.toContain(KEY);

    const { stdout: stored } = await kubectl([
      'get',
      'secret',
      '-n',
      namespace,
      SECRET,
      '-o',
      'jsonpath={.data.apiKey}',
    ]);
    expect(Buffer.from(stored, 'base64').toString('utf8')).toBe(KEY);
    const { stdout: model } = await kubectl([
      'get',
      'modelconfig',
      '-n',
      namespace,
      MODEL,
      '-o',
      'jsonpath={.spec.apiKeySecret}',
    ]);
    expect(model).toBe(SECRET);
  } finally {
    await kubectl([
      'delete',
      'modelconfig,secret',
      '-n',
      await organizationNamespace(),
      MODEL,
      SECRET,
      '--ignore-not-found',
    ]).catch(() => undefined);
  }
});
