import type { Page } from '@playwright/test';
import {
  expect,
  expectWizardStep,
  fillAgentDetails,
  open,
  test,
} from './fixtures';
import {
  KUBECONFIG,
  kubectl,
  NEEDS_KUBECONFIG,
  PLATFORM_NAMESPACE,
} from './kubectl';

/**
 * The New agent wizard's Tools step names a connector muster does not reach
 * by its connection, in the Customize page's terms, instead of "0 tools": a
 * deactivated one reads Deactivated, one that never connected Not connected.
 * Both fixtures point at an address that never answers: one deactivated, one
 * without `autoStart`, which muster leaves unconnected.
 */

const DEACTIVATED = 'e2e-tools-deactivated';
const NOT_CONNECTED = 'e2e-tools-not-connected';

function fixture(name: string, displayName: string, extra: string): string {
  return `
apiVersion: muster.giantswarm.io/v1alpha1
kind: MCPServer
metadata:
  name: ${name}
  namespace: ${PLATFORM_NAMESPACE}
  annotations:
    ui.giantswarm.io/display-name: ${displayName}
spec:
  type: streamable-http
  url: http://${name}.invalid/mcp
  description: A connector of the Tools step's connection spec
${extra}`;
}

const FIXTURES = [
  fixture(DEACTIVATED, 'E2E Tools Deactivated', '  suspended: true\n'),
  fixture(NOT_CONNECTED, 'E2E Tools Not Connected', '  autoStart: false\n'),
].join('---');

async function reachTools(page: Page) {
  await open(page, '/customize/agents/new');
  await fillAgentDetails(page, {
    name: 'E2E Tools Connection',
    description: 'Connection check of the Playwright suite; never created.',
    instructions: 'You are a test agent.',
  });
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await expectWizardStep(page, 'Skills');
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await expectWizardStep(page, 'Tools');
}

/** A connector's card, found through the search where the grid offers one. */
async function connectorCard(page: Page, label: string) {
  const search = page.getByLabel('Search connectors');
  if (await search.isVisible()) {
    await search.fill(label);
  }
  return page.getByRole('group', { name: `Connector ${label}` });
}

test.describe('the Tools step and a connector muster does not reach', () => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);

  test.beforeAll(async () => {
    await kubectl(['apply', '-f', '-'], FIXTURES);
  });

  test.afterAll(async () => {
    await kubectl([
      '-n',
      PLATFORM_NAMESPACE,
      'delete',
      'mcpserver',
      DEACTIVATED,
      NOT_CONNECTED,
      '--ignore-not-found',
    ]).catch(() => undefined);
  });

  test('names its connection instead of 0 tools', async ({ admin }) => {
    await reachTools(admin);

    const deactivated = await connectorCard(admin, 'E2E Tools Deactivated');
    await expect(deactivated).toContainText('Deactivated: no tools listed', {
      timeout: 60_000,
    });

    const notConnected = await connectorCard(admin, 'E2E Tools Not Connected');
    await expect(notConnected).toContainText('Not connected: no tools listed', {
      timeout: 60_000,
    });
    await expect(notConnected).not.toContainText('0 tools');

    // The catalogue's group counts them by the same words.
    await expect(
      admin.getByRole('button', { name: /^Registered connectors — / }),
    ).toHaveAccessibleName(/\d+ not connected.*\d+ deactivated/);
  });
});
