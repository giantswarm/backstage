import { generateKeyPairSync } from 'node:crypto';
import { expect, open, test } from './fixtures';
import { lab } from './lab';
import {
  KUBECONFIG,
  kubectl,
  labOrganizationNamespace,
  NEEDS_KUBECONFIG,
} from './kubectl';

for (const scope of ['platform', 'organization'] as const) {
  test(`Vertex credentials: ${scope} model uploads JSON only on the credential page`, async ({
    admin,
  }) => {
    test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
    test.setTimeout(6 * 60_000);
    const namespace =
      scope === 'platform' ? 'kagent' : await labOrganizationNamespace();
    expect(namespace).not.toBe('');
    const name = `e2e-vertex-${scope}-${Date.now()}`;
    const secret = `tenant-credential-${name}`;
    const provider =
      scope === 'platform' ? 'AnthropicVertexAI' : 'GeminiVertexAI';
    const label =
      scope === 'platform' ? 'Claude on Vertex AI' : 'Gemini on Vertex AI';
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const credential = JSON.stringify({
      type: 'service_account',
      project_id: 'vertex-test',
      client_email: 'synthetic@vertex-test.iam.gserviceaccount.com',
      private_key: privateKey,
      token_uri: 'https://oauth2.googleapis.com/token',
    });
    try {
      await open(admin, '/customize/models/new');
      await admin.getByRole('button', { name: /Owner/ }).click();
      await admin
        .getByRole('option', {
          name: scope === 'platform' ? 'Platform' : lab.organization.name,
          exact: true,
        })
        .click();
      await admin.getByRole('textbox', { name: /^Name/ }).fill(name);
      await admin.getByRole('button', { name: /^Provider/ }).click();
      await admin.getByRole('option', { name: label, exact: true }).click();
      await admin
        .getByRole('textbox', { name: /Google Cloud project/ })
        .fill('vertex-test');
      await admin.getByRole('textbox', { name: /Location/ }).fill('global');
      await admin
        .getByRole('textbox', { name: /^Model/ })
        .fill(
          scope === 'platform'
            ? 'claude-sonnet-4-5@20250929'
            : 'gemini-2.5-pro',
        );
      await expect(admin.getByLabel('Service account key file')).toHaveCount(0);
      await admin
        .getByRole('button', { name: 'Continue to credential' })
        .click();
      await expect(
        admin.getByRole('heading', { name: 'Enter a credential', exact: true }),
      ).toBeVisible();
      await admin.getByLabel('Service account key file').setInputFiles({
        name: 'synthetic-service-account.json',
        mimeType: 'application/json',
        buffer: Buffer.from(credential),
      });
      await expect(admin.getByText(/synthetic@vertex-test/)).toBeVisible();
      expect(await admin.content()).not.toContain(privateKey);
      await admin.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(
        admin.getByText('Credential saved', { exact: true }),
      ).toBeVisible({ timeout: 60_000 });
      const { stdout } = await kubectl([
        'get',
        'modelconfig',
        name,
        '-n',
        namespace,
        '-o',
        'jsonpath={.spec.provider}:{.spec.apiKeySecretKey}',
      ]);
      expect(stdout).toBe(`${provider}:GOOGLE_APPLICATION_CREDENTIALS`);
      expect(
        await admin.evaluate(() => JSON.stringify({ ...window.localStorage })),
      ).not.toContain(privateKey);
    } finally {
      await kubectl([
        'delete',
        'modelconfig',
        name,
        '-n',
        namespace,
        '--ignore-not-found',
      ]).catch(() => undefined);
      await kubectl([
        'delete',
        'secret',
        secret,
        '-n',
        namespace,
        '--ignore-not-found',
      ]).catch(() => undefined);
    }
  });
}
