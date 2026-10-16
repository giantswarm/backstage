import type { Page } from '@playwright/test';
import { connectToMuster, expect, open, test } from './fixtures';
import { lab } from './lab';
import {
  KUBECONFIG,
  kubectl,
  NEEDS_KUBECONFIG,
  PLATFORM_NAMESPACE,
} from './kubectl';

// The portal cannot set a connector's display name — muster's create and
// update tools take no annotations — so the fixture is applied with
// `kubectl`, the way an admin or a chart sets it.

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

/** A connector's row in the table: its name, then its description. */
function connectorRow(page: Page, name: string) {
  return page.getByRole('row', { name: new RegExp(`^${name}( |$)`) });
}

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
