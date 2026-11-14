import { generateKeyPairSync } from 'node:crypto';
import type { Request } from '@playwright/test';
import { expect, open, reloadAccepting, test } from './fixtures';
import { lab } from './lab';
import {
  KUBECONFIG,
  kubectl,
  labOrganizationNamespace,
  NEEDS_KUBECONFIG,
} from './kubectl';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

for (const scope of ['platform', 'organization'] as const) {
  test(`Vertex credentials: ${scope} model uploads JSON only on the credential page`, async ({
    admin,
    signInAs,
  }) => {
    test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
    test.setTimeout(6 * 60_000);
    const namespace =
      scope === 'platform' ? 'kagent' : await labOrganizationNamespace();
    if (!namespace) {
      throw new Error('The lab organization namespace is missing.');
    }
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
    const kubernetesWrites: { method: string; pathname: string }[] = [];
    const recordKubernetesWrite = (request: Request) => {
      const method = request.method();
      const pathname = new URL(request.url()).pathname;
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
      if (!pathname.startsWith('/api/kubernetes/proxy/')) return;
      // Authorization reviews do not persist Kubernetes objects.
      if (
        /\/apis\/authorization\.k8s\.io\/v1\/selfsubject(?:access|rules)reviews$/.test(
          pathname,
        )
      )
        return;
      kubernetesWrites.push({ method, pathname });
    };
    admin.on('request', recordKubernetesWrite);
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
      if (scope === 'platform') {
        const endpoint = admin.getByRole('textbox', { name: /^Base URL/ });
        await admin.getByRole('textbox', { name: /^Model/ }).fill('test-model');
        await endpoint.fill('https://user:synthetic-value@models.example/v1');
        await admin
          .getByRole('button', { name: 'Continue to credential' })
          .click();
        await expect(endpoint).toHaveAttribute('aria-invalid', 'true');
        await expect(
          admin.getByText(/Use an endpoint URL without credentials/),
        ).toBeVisible();
        await endpoint.fill('https://previous-provider.example/v1');
        await expect(endpoint).not.toHaveAttribute('aria-invalid', 'true');
      }
      await admin.getByRole('button', { name: /Provider/ }).click();
      await admin.getByRole('option', { name: label, exact: true }).click();
      await expect(
        admin.getByText(
          /LLM gateway metering, rate limits and spend reporting are unavailable/,
        ),
      ).toBeVisible();
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
      const credentialPath = new URL(admin.url()).pathname;
      const otherPerson = await signInAs(lab.users.dev);
      await open(otherPerson, credentialPath, lab.users.dev);
      await expect(otherPerson.getByText('This request is gone')).toBeVisible();
      await reloadAccepting(admin);
      await expect(admin.getByText(/synthetic@vertex-test/)).toBeHidden();
      await admin.getByLabel('Service account key file').setInputFiles({
        name: 'synthetic-service-account.json',
        mimeType: 'application/json',
        buffer: Buffer.from(credential),
      });
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
      expect(
        kubernetesWrites,
        'portal model onboarding uses manager operations',
      ).toEqual([]);
    } finally {
      admin.off('request', recordKubernetesWrite);
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
