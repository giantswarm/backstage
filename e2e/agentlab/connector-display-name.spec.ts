import { connectorRow } from './connectors';
import { connectToMuster, expect, open, test } from './fixtures';
import { lab } from './lab';
import {
  KUBECONFIG,
  kubectl,
  NEEDS_KUBECONFIG,
  PLATFORM_NAMESPACE,
} from './kubectl';

// The first fixture is applied with `kubectl`, the way an admin or a chart
// sets a display name. The second is added through Add connector, which keeps
// the typed name as the display name on a muster that takes one (v5.43.0 and
// later): the lab runs one.

/** Where the lab's muster reads its MCPServers from. */
const NAMESPACE = PLATFORM_NAMESPACE;
const NAME = 'e2e-display-name';
const DISPLAY_NAME = 'E2E Display Name';

/**
 * A connector of its own, so the specs that assert the lab's fixtures by name
 * are left alone. Deactivated, so muster never dials its address: the
 * connector exists for the portal to name, nothing more.
 */
const FIXTURE = `
apiVersion: muster.giantswarm.io/v1alpha1
kind: MCPServer
metadata:
  name: ${NAME}
  namespace: ${NAMESPACE}
  annotations:
    ui.giantswarm.io/display-name: ${DISPLAY_NAME}
spec:
  type: streamable-http
  url: http://${NAME}.invalid/mcp
  description: Named by its display-name annotation
  suspended: true
`;

const scope = `?installation=${lab.installation}`;

test.describe('a connector with a display name', () => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);

  test.beforeAll(async () => {
    await kubectl(['apply', '-f', '-'], FIXTURE);
  });

  test.afterAll(async () => {
    await kubectl([
      '-n',
      NAMESPACE,
      'delete',
      'mcpserver',
      NAME,
      '--ignore-not-found',
    ]).catch(() => undefined);
  });

  test('is listed by its display name, found by either name, and linked by its name', async ({
    admin,
  }) => {
    await open(admin, `/customize/connectors${scope}`);
    await connectToMuster(admin, admin.getByRole('grid'));

    const row = connectorRow(admin, DISPLAY_NAME);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(
      row.getByRole('link', { name: DISPLAY_NAME, exact: true }),
    ).toHaveAttribute(
      'href',
      `/customize/connectors/${lab.installation}/${NAME}`,
    );

    const search = admin.getByRole('searchbox', {
      name: 'Search connectors and tools',
    });
    await search.fill(NAME);
    await expect(row).toBeVisible();
    await search.fill('display name');
    await expect(row).toBeVisible();
  });

  test('heads its page with the display name and keeps its name in Technical details', async ({
    admin,
  }) => {
    await open(
      admin,
      `/customize/connectors/${lab.installation}/${NAME}/details`,
    );

    await expect(
      admin.getByRole('heading', { level: 1, name: DISPLAY_NAME }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      admin.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toContainText(DISPLAY_NAME);
    await expect(admin).toHaveTitle(new RegExp(`^${DISPLAY_NAME} · `));

    await admin.getByRole('button', { name: 'Technical details' }).click();
    await expect(
      admin.getByText(`${NAMESPACE}/${NAME}`, { exact: true }),
    ).toBeVisible();
  });
});

/** What the wizard spec types, and the technical name it derives. */
const TYPED = 'E2E Wizard Name';
const WIZARD_NAME = 'e2e-wizard-name';
const RENAMED = 'E2E Wizard Renamed';

/** The connector's `ui.giantswarm.io/display-name`, read from its CR. */
async function displayNameAnnotation(): Promise<string> {
  const { stdout } = await kubectl([
    '-n',
    NAMESPACE,
    'get',
    'mcpserver',
    WIZARD_NAME,
    '-o',
    'jsonpath={.metadata.annotations.ui\\.giantswarm\\.io/display-name}',
  ]);
  return stdout;
}

async function deleteWizardConnector() {
  await kubectl([
    '-n',
    NAMESPACE,
    'delete',
    'mcpserver',
    WIZARD_NAME,
    '--ignore-not-found',
  ]).catch(() => undefined);
}

test.describe('a connector added through the wizard', () => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);

  test.beforeAll(deleteWizardConnector);
  test.afterAll(deleteWizardConnector);

  test('keeps the typed name as its display name, and an edit renames it', async ({
    admin,
  }) => {
    await open(admin, `/customize/connectors/new${scope}`);
    // muster dials an address that does not resolve, so the
    // Test step reports it unreachable — the name is what is checked here.
    await admin
      .getByRole('textbox', { name: 'Server address', exact: true })
      .fill(`http://${WIZARD_NAME}.invalid/mcp`);
    await admin.getByRole('textbox', { name: 'Name', exact: true }).fill(TYPED);
    await expect(admin.getByText(/^Registered as/)).toContainText(
      `Registered as ${WIZARD_NAME}`,
    );
    await admin.getByRole('button', { name: 'Continue' }).click();
    await connectToMuster(admin, admin.getByText('How do people sign in?'));
    await admin.getByRole('radio', { name: 'No sign-in' }).click();
    await admin.getByRole('button', { name: 'Add connector' }).click();
    await expect(admin.getByText('Test the connection')).toBeVisible({
      timeout: 60_000,
    });
    await expect.poll(displayNameAnnotation).toBe(TYPED);

    await open(admin, `/customize/connectors${scope}`);
    await connectToMuster(admin, admin.getByRole('grid'));
    await expect(connectorRow(admin, TYPED)).toBeVisible({ timeout: 60_000 });

    await open(
      admin,
      `/customize/connectors/${lab.installation}/${WIZARD_NAME}/edit`,
    );
    const name = admin.getByRole('textbox', { name: 'Name', exact: true });
    await expect(name).toHaveValue(TYPED, { timeout: 60_000 });
    await expect(name).toBeEditable();
    await name.fill(RENAMED);
    await admin.getByRole('button', { name: 'Continue' }).click();
    await admin.getByRole('button', { name: 'Save changes' }).click();
    await expect(admin.getByText('Test the connection')).toBeVisible({
      timeout: 60_000,
    });
    await expect.poll(displayNameAnnotation).toBe(RENAMED);
  });
});
