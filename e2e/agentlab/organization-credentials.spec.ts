import { expect, expectNoHorizontalScroll, open, test } from './fixtures';
import { lab } from './lab';
import type { Page, Request } from '@playwright/test';
import {
  KUBECONFIG,
  kubectl,
  labOrganizationNamespace,
  NEEDS_KUBECONFIG,
} from './kubectl';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

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
const LARGE_KEY_PREFIX = `e2e-large-credential-${stamp}-never-shown-`;
const BASE = `/organizations/${lab.installation}/${PARENT}/${ORGANIZATION}`;

test.afterEach(async () => {
  if (!KUBECONFIG) return;
  for (const service of [
    'backstage',
    'agent-manager',
    'muster',
    'agentgateway',
  ]) {
    const { stdout } = await kubectl([
      'logs',
      '-n',
      'agent-platform',
      `deployment/${service}`,
      '--all-containers=true',
      '--all-pods=true',
      '--since=15m',
    ]).catch(() => {
      throw new Error(
        `Could not read ${service} logs for credential verification`,
      );
    });
    expect(
      stdout.includes(KEY),
      `fixture credential appeared in ${service} logs`,
    ).toBe(false);
    expect(
      stdout.includes(LARGE_KEY_PREFIX),
      `large fixture credential appeared in ${service} logs`,
    ).toBe(false);
  }
});

async function organizationNamespace(): Promise<string> {
  const namespace = await labOrganizationNamespace();
  if (!namespace) {
    throw new Error(
      `the lab has no organization ${PARENT}/${ORGANIZATION} (AGENTLAB_ORGANIZATION)`,
    );
  }
  return namespace;
}

async function prepareModel(page: Page, name: string) {
  await open(page, `${BASE}/models`);
  await page
    .getByRole('button', { name: 'Add model', exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /Name/ }).fill(name);
  await dialog
    .getByRole('textbox', { name: /Model/ })
    .fill('claude-sonnet-4-6');
  await dialog
    .getByRole('button', { name: 'Continue to the key', exact: true })
    .click();
}

async function cleanupModel(namespace: string, name: string) {
  await kubectl([
    'delete',
    'modelconfig',
    '-n',
    namespace,
    name,
    '--ignore-not-found',
  ]);
  await kubectl([
    'delete',
    'secret',
    '-n',
    namespace,
    `tenant-credential-${name}`,
    '--ignore-not-found',
  ]);
}

async function prepareModelRequests(page: Page, name: string) {
  const call = page.waitForRequest(
    request =>
      request.method() === 'POST' &&
      request.url().includes('/api/muster/call') &&
      request.postDataJSON()?.name === 'x_agent-manager_set_organization_model',
    { timeout: 60_000 },
  );
  const confirmation = page.waitForResponse(
    response =>
      response.request().method() === 'GET' &&
      response.url().includes('/organizations/credential-operations/'),
    { timeout: 60_000 },
  );
  const [modelCall, modelConfirmation] = await Promise.all([
    call,
    confirmation,
    prepareModel(page, name),
  ]);
  await expect(page.getByLabel(/^Value/)).toBeVisible();
  return { call: modelCall, confirmation: modelConfirmation };
}

async function requestHeaders(request: Request) {
  return Object.fromEntries(
    Object.entries(await request.allHeaders()).filter(
      ([key]) =>
        !key.startsWith(':') &&
        !['content-length', 'host', 'connection'].includes(key),
    ),
  );
}

async function prepareOperation(
  page: Page,
  request: Request,
  name: string,
  parameters: Record<string, unknown>,
) {
  const headers = await requestHeaders(request);
  const response = await page.request.post(request.url(), {
    headers,
    data: { name, arguments: parameters, urlElicitation: false },
  });
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.credentialOperation).toMatch(/^[a-f0-9]{48}$/);
  return result.credentialOperation as string;
}

test('organization credentials: refresh and request navigation clear earlier values and results', async ({
  admin,
}) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  const namespace = await organizationNamespace();
  const first = `${MODEL}-first`;
  const second = `${MODEL}-second`;
  try {
    const { call } = await prepareModelRequests(admin, first);
    const firstPath = new URL(admin.url()).pathname;
    await admin.getByLabel(/^Value/).fill(KEY);
    await admin
      .getByRole('button', { name: 'Check again', exact: true })
      .click();
    await expect(admin.getByLabel(/^Value/)).toHaveValue('');
    await expect(admin.getByLabel(/^Value/)).toBeEnabled();
    const operation = await prepareOperation(
      admin,
      call,
      'x_agent-manager_set_organization_model',
      {
        ...call.postDataJSON().arguments,
        name: second,
        credentialSecret: `tenant-credential-${first}`,
        requestId: crypto.randomUUID(),
      },
    );
    await admin.getByLabel(/^Value/).fill(KEY);
    const secondPath = `${BASE}/credentials/${operation}`;
    await admin.evaluate(path => {
      window.history.pushState(window.history.state, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, secondPath);
    await expect(admin.getByLabel(/^Value/)).toHaveValue('');
    await admin.getByLabel(/^Value/).fill(KEY);
    await admin.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      admin.getByText('Credential saved', { exact: true }),
    ).toBeVisible();
    await admin.evaluate(path => {
      window.history.pushState(window.history.state, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, firstPath);
    await expect(admin.getByLabel(/^Value/)).toHaveValue('');
    await expect(
      admin.getByText('Credential saved', { exact: true }),
    ).toHaveCount(0);
    await admin
      .getByRole('button', { name: 'Cancel request', exact: true })
      .click();
    await expect(
      admin.getByText('Request cancelled', { exact: true }),
    ).toBeVisible();
    await admin.evaluate(path => {
      window.history.pushState(window.history.state, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, secondPath);
    await expect(
      admin.getByText('Credential saved', { exact: true }),
    ).toBeVisible();
    await expect(
      admin.getByText('Request cancelled', { exact: true }),
    ).toHaveCount(0);
  } finally {
    await cleanupModel(namespace, second);
    await cleanupModel(namespace, first);
  }
});

test('organization credentials: maximum escaped values reach agent-manager through the portal', async ({
  admin,
}) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  test.setTimeout(3 * 60_000);
  const namespace = await organizationNamespace();
  const name = `${MODEL}-large`;
  const model = `${name}-auth`;
  const secretNames = Array.from(
    { length: 16 },
    (_, index) => `tenant-credential-${name}-${index}`,
  );
  try {
    const { call, confirmation } = await prepareModelRequests(admin, model);
    await kubectl(
      ['apply', '-f', '-'],
      JSON.stringify({
        apiVersion: 'api.kagent.dev/v1alpha3',
        kind: 'RemoteMCPServer',
        metadata: { namespace, name },
        spec: {
          description: 'Credential body limit fixture',
          url: 'https://credential-proof.invalid/mcp',
          headersFrom: secretNames.map((secret, index) => ({
            name: `X-Credential-${index}`,
            valueFrom: { type: 'Secret', name: secret, key: 'token' },
          })),
        },
      }),
    );
    const operation = await prepareOperation(
      admin,
      call,
      'x_agent-manager_set_organization_connector',
      { namespace, name, requestId: crypto.randomUUID() },
    );
    const headers = await requestHeaders(confirmation.request());
    const url = new URL(confirmation.url());
    url.pathname = url.pathname.replace(/[a-f0-9]{48}$/, operation);
    const current = await admin.request.get(url.toString(), { headers });
    expect(current.status()).toBe(200);
    const values = secretNames.map(secret => ({
      secret,
      key: 'token',
      value:
        LARGE_KEY_PREFIX + '\u0001'.repeat(16 * 1024 - LARGE_KEY_PREFIX.length),
    }));
    expect(JSON.stringify({ values }).length).toBeGreaterThan(1024 * 1024);
    const unconditional = await admin.request.post(url.toString(), {
      headers,
      data: { values },
    });
    expect(unconditional.status()).toBe(428);
    const stale = await admin.request.post(url.toString(), {
      headers: { ...headers, 'if-match': '"stale"' },
      data: { values },
    });
    expect(stale.status()).toBe(412);
    const saved = await admin.request.post(url.toString(), {
      headers: { ...headers, 'if-match': current.headers().etag },
      data: { values },
      timeout: 60_000,
    });
    expect(saved.status()).toBe(200);
    const replayed = await admin.request.post(url.toString(), {
      headers: { ...headers, 'if-match': current.headers().etag },
      data: { values },
    });
    expect(replayed.status()).toBe(200);
    expect(await replayed.json()).toEqual(await saved.json());
    const oversized = await admin.request.post(url.toString(), {
      headers: { ...headers, 'if-match': current.headers().etag },
      data: {
        values: [
          {
            secret: secretNames[0],
            key: 'token',
            value: '\u0001'.repeat(400_000),
          },
        ],
      },
    });
    expect(oversized.status()).toBe(413);
    const { stdout } = await kubectl([
      'get',
      'secret',
      '-n',
      namespace,
      ...secretNames,
      '-o',
      'json',
    ]);
    const secrets = JSON.parse(stdout).items;
    expect(secrets).toHaveLength(16);
    const encoded = Buffer.from(values[0].value).toString('base64');
    expect(
      secrets.every(
        (secret: { data?: { token?: string } }) =>
          secret.data?.token === encoded,
      ),
      'each Secret holds its fixture value',
    ).toBe(true);
    await test.info().attach('credential-protocol-results', {
      contentType: 'application/json',
      body: Buffer.from(
        JSON.stringify({
          requestBytes: Buffer.byteLength(JSON.stringify({ values })),
          valueBytes: Buffer.byteLength(values[0].value),
          persistedSecrets: secrets.length,
          missingIfMatch: unconditional.status(),
          staleIfMatch: stale.status(),
          save: saved.status(),
          replay: replayed.status(),
          oversized: oversized.status(),
        }),
      ),
    });
  } finally {
    await kubectl([
      'delete',
      'remotemcpserver',
      '-n',
      namespace,
      name,
      '--ignore-not-found',
    ]);
    await kubectl([
      'delete',
      'secret',
      '-n',
      namespace,
      ...secretNames,
      '--ignore-not-found',
    ]);
    await cleanupModel(namespace, model);
  }
});

test('organization credentials: existing key completes and closes the model dialog', async ({
  admin,
}) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  const namespace = await organizationNamespace();
  const name = `${MODEL}-existing`;
  await kubectl(
    ['apply', '-f', '-'],
    JSON.stringify({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { namespace, name: `tenant-credential-${name}` },
      stringData: { apiKey: KEY },
    }),
  );
  try {
    await prepareModel(admin, name);
    await expect(admin.getByRole('dialog')).toHaveCount(0);
    await expect(
      admin.getByRole('rowheader', { name, exact: true }),
    ).toBeVisible();
    await expectNoHorizontalScroll(
      admin,
      'organization models after completion',
    );
    await expect(admin).toHaveURL(new RegExp(`${BASE}/models$`));
  } finally {
    await cleanupModel(namespace, name);
  }
});

test('organization credentials: stale Cancel recovers an independently completed operation', async ({
  admin,
}) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  const namespace = await organizationNamespace();
  const name = `${MODEL}-cancel`;
  try {
    const confirmation = admin.waitForResponse(
      response =>
        response.request().method() === 'GET' &&
        response.url().includes('/organizations/credential-operations/'),
    );
    await prepareModel(admin, name);
    const response = await confirmation;
    await expect(admin.getByLabel(/^Value/)).toBeVisible();
    await expectNoHorizontalScroll(admin, 'credential form');
    const headers = await requestHeaders(response.request());
    const independentSave = await admin.request.post(response.url(), {
      headers: { ...headers, 'if-match': response.headers().etag },
      data: {
        values: [
          { secret: `tenant-credential-${name}`, key: 'apiKey', value: KEY },
        ],
      },
    });
    expect(independentSave.status()).toBe(200);
    await admin
      .getByRole('button', { name: 'Cancel request', exact: true })
      .click();
    await expect(
      admin.getByText('Credential saved', { exact: true }),
    ).toBeVisible();
    await expect(admin.getByText('Not cancelled', { exact: true })).toHaveCount(
      0,
    );
    await expect(
      admin.getByText('Check the request again', { exact: true }),
    ).toHaveCount(0);
    await expect(admin.getByLabel(/^Value/)).toHaveCount(0);
  } finally {
    await cleanupModel(namespace, name);
  }
});

test('organization credentials: recovery saves without stale warnings', async ({
  admin,
}) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  const namespace = await organizationNamespace();
  const name = `${MODEL}-recover`;
  let stagedFailure = false;
  const pattern = '**/organizations/credential-operations/*?*';
  await admin.route(pattern, async route => {
    if (route.request().method() === 'POST' && !stagedFailure) {
      stagedFailure = true;
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            name: 'AgentManagerError',
            code: 'outcome_unknown',
            message: 'Staged lost save response',
          },
          response: { statusCode: 502 },
        }),
      });
      return;
    }
    if (route.request().method() === 'GET' && stagedFailure) {
      const response = await route.fetch();
      const body = await response.json();
      if (body.state === 'pending') body.state = 'uncertain';
      await route.fulfill({ response, json: body });
      return;
    }
    await route.continue();
  });
  try {
    await prepareModel(admin, name);
    await admin.getByLabel(/^Value/).fill(KEY);
    const recoveryRead = admin.waitForResponse(
      response =>
        response.request().method() === 'GET' &&
        response.url().includes('/organizations/credential-operations/'),
    );
    await admin.getByRole('button', { name: 'Save', exact: true }).click();
    await recoveryRead;
    await expect(
      admin.getByText('An earlier save of this request did not finish', {
        exact: true,
      }),
    ).toBeVisible();
    await admin.getByLabel(/^Value/).fill(KEY);
    await admin.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      admin.getByText('Credential saved', { exact: true }),
    ).toBeVisible();
    await expect(
      admin.getByText('Check the request again', { exact: true }),
    ).toHaveCount(0);
    await expect(
      admin.getByText('An earlier save of this request did not finish', {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(admin.getByLabel(/^Value/)).toHaveCount(0);
  } finally {
    await admin.unroute(pattern);
    await cleanupModel(namespace, name);
  }
});

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
    expect(
      Buffer.from(stored, 'base64').toString('utf8') === KEY,
      'the Secret holds the fixture key',
    ).toBe(true);
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
