import type { Locator, Page } from '@playwright/test';
import { connectorRow } from './connectors';
import {
  completeDexLogin,
  connectToMuster,
  expect,
  open,
  test,
} from './fixtures';
import { lab } from './lab';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';

// A connector's client typed into the wizard (giantswarm/giantswarm#38849):
// muster stores it, as the person, in a Secret owned by the MCPServer and
// names it `<server>-oauth-client-<5 of [a-z0-9]>`; the portal shows it as
// stored and never reads it back. The client is the lab's
// `lab-oauth-fixture`'s own (Dex's platform client) with its pinned Dex
// endpoints, so the new connector signs in like the fixture. Its issuer is
// its own, though: muster refuses a second connector naming the same issuer
// with another client, and the issuer keys a person's grant. Needs a muster
// that takes `clientCredentials`.

const FIXTURE = 'lab-oauth-fixture';
const TYPED = 'E2E Client Credentials';
const NAME = 'e2e-client-credentials';
const STORED = new RegExp(`^${NAME}-oauth-client-[a-z0-9]{5}$`);

const scope = `?installation=${lab.installation}`;

type SecretRef = {
  name: string;
  namespace?: string;
  clientIdKey?: string;
  clientSecretKey?: string;
};

type AuthorizationServer = {
  issuer: string;
  scopes?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  clientCredentialsSecretRef?: SecretRef;
};

type Fixture = {
  namespace: string;
  url: string;
  authorizationServer: AuthorizationServer;
  clientId: string;
  clientSecret: string;
};

async function getJson<T>(args: string[]): Promise<T> {
  const { stdout } = await kubectl([...args, '-o', 'json']);
  return JSON.parse(stdout) as T;
}

/** The fixture's address, authorization server and client, from the lab. */
async function readFixture(): Promise<Fixture> {
  const { items } = await getJson<{
    items: Array<{
      metadata: { name: string; namespace: string };
      spec: { url: string; auth: { authorizationServer: AuthorizationServer } };
    }>;
  }>(['get', 'mcpservers', '--all-namespaces']);
  const server = items.find(item => item.metadata.name === FIXTURE);
  if (!server) {
    throw new Error(`The lab has no MCPServer ${FIXTURE}`);
  }
  const { namespace } = server.metadata;
  const { authorizationServer } = server.spec.auth;
  const ref = authorizationServer.clientCredentialsSecretRef;
  if (!ref) {
    throw new Error(`${FIXTURE} names no client Secret`);
  }
  const secret = await getJson<{ data: Record<string, string> }>([
    '-n',
    ref.namespace ?? namespace,
    'get',
    'secret',
    ref.name,
  ]);
  const value = (key: string) =>
    Buffer.from(secret.data[key] ?? '', 'base64').toString('utf8');
  return {
    namespace,
    url: server.spec.url,
    authorizationServer,
    clientId: value(ref.clientIdKey ?? 'client-id'),
    clientSecret: value(ref.clientSecretKey ?? 'client-secret'),
  };
}

/** The connector's client Secret reference, or '' without one. */
async function storedSecretName(namespace: string): Promise<string> {
  const { stdout } = await kubectl([
    '-n',
    namespace,
    'get',
    'mcpserver',
    NAME,
    '-o',
    'jsonpath={.spec.auth.authorizationServer.clientCredentialsSecretRef.name}',
  ]).catch(() => ({ stdout: '' }));
  return stdout.trim();
}

/** The MCPServers that own the Secret, by name. */
async function secretOwners(
  namespace: string,
  secret: string,
): Promise<string[]> {
  const { metadata } = await getJson<{
    metadata: { ownerReferences?: Array<{ kind: string; name: string }> };
  }>(['-n', namespace, 'get', 'secret', secret]);
  return (metadata.ownerReferences ?? [])
    .filter(owner => owner.kind === 'MCPServer')
    .map(owner => owner.name);
}

async function deleteConnector(namespace: string) {
  await kubectl([
    '-n',
    namespace,
    'delete',
    'mcpserver',
    NAME,
    '--ignore-not-found',
  ]).catch(() => undefined);
}

/** Clicks Continue until `next` shows (see connector-display-name.spec.ts). */
async function continueTo(page: Page, next: Locator) {
  const proceed = page.getByRole('button', { name: 'Continue' });
  await expect(async () => {
    if (!(await next.isVisible())) {
      await proceed.click({ timeout: 5_000 });
    }
    await expect(next).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
}

/**
 * The connector's issuer: on muster's public host like the fixture's, under a
 * path of its own (see the note at the top).
 */
function issuerOf(fixtureIssuer: string): string {
  return `${new URL(fixtureIssuer).origin}/v38849-${NAME}`;
}

/**
 * Signs the admin in to the new connector from its page, through muster's
 * OAuth proxy and the lab Dex, and waits until it no longer asks: the
 * stored client is what the authorization server accepted.
 */
async function signInToConnector(admin: Page): Promise<void> {
  await open(admin, `/customize/connectors/${lab.installation}/${NAME}`);
  await expect(
    admin.getByRole('heading', { level: 1, name: TYPED }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    admin.getByRole('main'),
    'the connector settles on Auth Required (or Connected from an earlier run)',
  ).toContainText(/Auth Required|Connected/, { timeout: 120_000 });
  await admin.getByRole('tab', { name: /^Tools/ }).click();
  // The page's own Sign in, not the one of the inbox's MCP sign-in row.
  const signIn = admin
    .getByRole('main')
    .getByRole('button', { name: 'Sign in' })
    .first();
  await expect(
    signIn.or(admin.getByRole('tab', { name: /^Tools \([1-9]/ })).first(),
    'an OAuth connector offers Sign in, or its tools once signed in',
  ).toBeVisible({ timeout: 60_000 });
  if (await signIn.isVisible()) {
    const popup = admin.waitForEvent('popup');
    await signIn.click();
    await completeDexLogin(await popup, lab.users.admin);
  }
  await expect(signIn, 'signed in, the page no longer asks for it').toBeHidden({
    timeout: 60_000,
  });
  await expect(admin.getByRole('main')).toContainText('Connected', {
    timeout: 60_000,
  });
}

/**
 * Signs the admin out of the connector (the header's More actions), as
 * mcp-servers.spec.ts leaves the fixture. Nothing to do when not signed in.
 */
async function signOutOfConnector(admin: Page): Promise<void> {
  await open(admin, `/customize/connectors/${lab.installation}/${NAME}`);
  await expect(
    admin.getByRole('heading', { level: 1, name: TYPED }),
  ).toBeVisible({ timeout: 60_000 });
  await admin.getByRole('button', { name: 'More actions' }).click();
  const signOut = admin.getByRole('menuitem', { name: 'Sign out' });
  const signedIn = await signOut
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(
      () => true,
      () => false,
    );
  if (!signedIn) {
    await admin.keyboard.press('Escape');
    return;
  }
  await signOut.click();
  await expect(
    admin.getByRole('main').getByRole('button', { name: 'Sign in' }).first(),
  ).toBeVisible({ timeout: 60_000 });
}

function credentialsGroup(page: Page): Locator {
  return page.getByRole('group', { name: 'Client credentials', exact: true });
}

async function typeClient(
  page: Page,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  const group = credentialsGroup(page);
  await group
    .getByRole('textbox', { name: 'Client ID', exact: true })
    .fill(clientId);
  // Chromium exposes a password input as a textbox; its label's "(optional)"
  // is aria-hidden, so the accessible name is the label alone.
  await group
    .getByRole('textbox', { name: 'Client secret', exact: true })
    .fill(clientSecret);
}

test.describe('a connector whose client is typed into the wizard', () => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  test.describe.configure({ mode: 'serial' });

  let fixture: Fixture;

  test.beforeAll(async () => {
    fixture = await readFixture();
    await deleteConnector(fixture.namespace);
  });

  test.afterAll(async ({ adminPage }) => {
    // The admin's grant is muster's, keyed by the issuer, and outlives the
    // connector: signed out, the next run's sign-in goes through Dex again.
    await signOutOfConnector(adminPage).catch(() => undefined);
    if (fixture) {
      await deleteConnector(fixture.namespace);
    }
  });

  test('stores the client in a Secret owned by the connector, which signs in', async ({
    admin,
  }) => {
    test.setTimeout(300_000);
    await open(admin, `/customize/connectors/new${scope}`);
    await admin
      .getByRole('textbox', { name: 'Server address', exact: true })
      .fill(fixture.url);
    await admin.getByRole('textbox', { name: 'Name', exact: true }).fill(TYPED);
    const signInStep = admin.getByText('How do people sign in?');
    await continueTo(
      admin,
      admin
        .getByRole('button', { name: 'Connect to muster' })
        .or(signInStep)
        .first(),
    );
    await connectToMuster(admin, signInStep);

    await admin
      .getByRole('radio', {
        name: 'Each person signs in with their own account',
      })
      .click();
    await admin
      .getByText("Advanced: sign-in settings for apps muster can't look up")
      .click();
    const { authorizationServer } = fixture;
    await admin
      .getByRole('textbox', { name: /^Where people sign in \(issuer URL\)/ })
      .fill(issuerOf(authorizationServer.issuer));
    if (authorizationServer.scopes) {
      await admin
        .getByRole('textbox', { name: /^Permissions to ask for \(scopes\)/ })
        .fill(authorizationServer.scopes);
    }
    if (
      authorizationServer.authorizationEndpoint &&
      authorizationServer.tokenEndpoint
    ) {
      await admin
        .getByRole('textbox', {
          name: /^Sign-in page address \(authorization endpoint\)/,
        })
        .fill(authorizationServer.authorizationEndpoint);
      await admin
        .getByRole('textbox', { name: /^Token address \(token endpoint\)/ })
        .fill(authorizationServer.tokenEndpoint);
    }
    await typeClient(admin, fixture.clientId, fixture.clientSecret);
    await admin.getByRole('button', { name: 'Add connector' }).click();
    await expect(admin.getByText('Test the connection')).toBeVisible({
      timeout: 60_000,
    });

    await expect
      .poll(() => storedSecretName(fixture.namespace), { timeout: 30_000 })
      .toMatch(STORED);
    const secret = await storedSecretName(fixture.namespace);
    expect(await secretOwners(fixture.namespace, secret)).toEqual([NAME]);

    await open(admin, `/customize/connectors${scope}`);
    await connectToMuster(admin, admin.getByRole('grid'));
    await expect(connectorRow(admin, TYPED)).toBeVisible({ timeout: 60_000 });

    await signInToConnector(admin);
  });

  test('shows the client as stored and replaces it with a new Secret', async ({
    admin,
  }) => {
    const before = await storedSecretName(fixture.namespace);
    expect(before).toMatch(STORED);

    await open(admin, `/customize/connectors/${lab.installation}/${NAME}/edit`);
    await expect(
      admin.getByRole('textbox', { name: 'Name', exact: true }),
    ).toHaveValue(TYPED, { timeout: 60_000 });
    const signInStep = admin.getByText('How do people sign in?');
    await continueTo(admin, signInStep);
    await connectToMuster(admin, signInStep);

    const group = credentialsGroup(admin);
    await expect(group.getByText('Client secret stored')).toBeVisible();
    await expect(admin.locator('body')).not.toContainText(fixture.clientSecret);

    await group.getByRole('button', { name: 'Replace', exact: true }).click();
    await typeClient(admin, fixture.clientId, fixture.clientSecret);
    await admin.getByRole('button', { name: 'Save changes' }).click();
    await expect(admin.getByText('Test the connection')).toBeVisible({
      timeout: 60_000,
    });

    await expect
      .poll(() => storedSecretName(fixture.namespace), { timeout: 30_000 })
      .not.toBe(before);
    const after = await storedSecretName(fixture.namespace);
    expect(after).toMatch(STORED);
    expect(await secretOwners(fixture.namespace, after)).toEqual([NAME]);
  });
});
