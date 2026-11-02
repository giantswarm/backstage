import type { Page, Route } from '@playwright/test';

import {
  expect,
  expectWizardStep,
  open,
  openReadyAgent,
  openWizardMoreOptions,
  startSessionButton,
  test,
  type LabAgent,
} from './fixtures';
import { KUBECONFIG, kubectl } from './kubectl';
import { RUN } from './lab';

/**
 * An agent's default workspace: set on the agent form, shown on the agent's
 * page, and the preset of its New session dialog, which starts in it through
 * `authorize_workspace` as any picked workspace, while "No workspace" starts
 * with `noWorkspace` so agent-manager never falls back on the default.
 *
 * The default is written through the lab's agent-manager on the worker's
 * fixture agent (`update_agent`'s `defaultWorkspace`, the annotation on its
 * HelmRelease and Agent) and removed again. The workspace itself is staged
 * at the browser in workspace-manager's shape, as is its access check, which
 * refuses: a refused start creates no Session, and the refusal names the
 * repositories and offers both ways on.
 */

type ToolCall = { name?: string; arguments?: Record<string, unknown> };

const TOOL = 'x_workspace-manager_';
const WORKSPACE = `e2e-default-${RUN}`;
const UNREADABLE = ['e2e-owner/private-one'];
const NOW = new Date().toISOString();
const LAST_WORKSPACE_KEY = 'gs-agent-platform-last-workspace';

/**
 * Lists the staged workspace beside the lab's, refuses its access check and
 * records every `authorize_workspace` and `start_session` the page sends.
 */
async function stageWorkspace(page: Page) {
  const checks: ToolCall[] = [];
  const starts: ToolCall[] = [];
  await page.route('**/api/muster/call**', async (route: Route) => {
    const call = route.request().postDataJSON() as ToolCall;
    if (call?.name === `${TOOL}list_workspaces`) {
      const answer = await (await route.fetch()).json();
      await route.fulfill({
        json: {
          ...answer,
          workspaces: [
            ...(answer?.workspaces ?? []),
            {
              name: WORKSPACE,
              organization: answer?.organizations?.[0] ?? 'lab',
              sources: [],
              sync: { schedule: 'nightly' },
              resourceVersion: '1',
              createdAt: NOW,
              repositories: 3,
              sessions: 0,
              lastSync: { time: NOW, result: 'Succeeded' },
            },
          ],
        },
      });
      return;
    }
    if (
      call?.name === `${TOOL}authorize_workspace` &&
      call.arguments?.workspace === WORKSPACE
    ) {
      checks.push(call);
      await route.fulfill({
        json: {
          workspace: WORKSPACE,
          outcome: 'refused',
          reason: '1 repository is not readable',
          unreadable: UNREADABLE,
        },
      });
      return;
    }
    if (call?.name === 'x_agent-manager_start_session') {
      starts.push(call);
    }
    await route.fallback();
  });
  return { checks, starts };
}

/** Sets (or, with `undefined`, removes) the agent's default on its edit form. */
async function setDefaultWorkspace(
  page: Page,
  agent: LabAgent,
  workspace: string | undefined,
) {
  await open(page, `${agent.detailPath}/edit`);
  await expectWizardStep(page, 'Details');
  await expect(
    page.getByRole('textbox', { name: 'What is it for?' }),
    'the form is pre-filled from get_agent',
  ).not.toBeEmpty({ timeout: 60_000 });
  await openWizardMoreOptions(page);
  await page.getByRole('button', { name: /Default workspace$/ }).click();
  await page
    .getByRole('option', {
      name: workspace ?? 'No default workspace',
      exact: true,
    })
    .click();
  for (const step of ['Details', 'Skills', 'Tools']) {
    await expectWizardStep(page, step);
    await page.getByRole('button', { name: 'Continue' }).first().click();
  }
  await expectWizardStep(page, 'Review');
  await expect(
    page
      .getByRole('list', { name: 'Changed fields' })
      .getByText('Default workspace'),
  ).toBeVisible();
  const save = page.getByRole('button', { name: /^Save changes$/ }).last();
  await expect(save).toBeEnabled({ timeout: 60_000 });
  await save.click();
  await expect(page).toHaveURL(new RegExp(`${agent.detailPath}$`), {
    timeout: 60_000,
  });
}

test('an agent’s default workspace: set on its form, preset for a new session, refused or left', async ({
  admin,
  labAgent,
}, testInfo) => {
  test.setTimeout(10 * 60_000);
  const { checks, starts } = await stageWorkspace(admin);
  await admin.addInitScript(
    key => window.localStorage.removeItem(key),
    LAST_WORKSPACE_KEY,
  );

  await setDefaultWorkspace(admin, labAgent, WORKSPACE);
  let failure: unknown;
  try {
    if (KUBECONFIG) {
      const [namespace, name] = labAgent.detailPath.split('/').slice(-2);
      await expect
        .poll(
          async () =>
            (
              await kubectl([
                '-n',
                namespace,
                'get',
                'helmreleases.helm.toolkit.fluxcd.io',
                name,
                '-o',
                'jsonpath={.spec.values.annotations.agent-platform\\.giantswarm\\.io/default-workspace}',
              ])
            ).stdout,
          { message: "the HelmRelease's default-workspace annotation" },
        )
        .toBe(`${namespace}/${WORKSPACE}`);
    }

    // The agent page shows it once the Agent carries the annotation.
    await expect(async () => {
      await openReadyAgent(admin, labAgent);
      await expect(
        admin.getByText('Default workspace', { exact: true }).first(),
      ).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 4 * 60_000 });
    await expect(admin.getByText(WORKSPACE).first()).toBeVisible();

    // The New session dialog presets the default, nothing chosen before.
    await startSessionButton(admin).click();
    const promptBox = admin.getByRole('textbox', { name: 'Prompt' });
    await expect(promptBox).toBeVisible();
    const picker = admin.getByRole('button', { name: /Workspace/ });
    await expect(picker).toContainText(WORKSPACE, { timeout: 60_000 });
    await expect(admin.getByText(`${labAgent.name}’s default`)).toBeVisible();
    await testInfo.attach('preset-default', {
      body: await admin.screenshot(),
      contentType: 'image/png',
    });

    // Starting in it is the same access check: refused, nothing started.
    await promptBox.fill('List the repositories of this workspace.');
    await admin.getByRole('button', { name: 'Start', exact: true }).click();
    const refusal = admin.getByRole('alert').filter({
      hasText: `You cannot read 1 repository of ${WORKSPACE}`,
    });
    await expect(refusal).toBeVisible({ timeout: 60_000 });
    await expect(refusal).toContainText(UNREADABLE[0]);
    await expect(
      refusal.getByRole('button', { name: 'Start without workspace' }),
    ).toBeVisible();
    expect(checks).toHaveLength(1);
    expect(starts).toHaveLength(0);

    // "No workspace" starts without one, said explicitly.
    await picker.click();
    await admin.getByRole('option', { name: 'No workspace' }).click();
    await admin.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(admin).toHaveURL(/\/sessions\/[^/]+\/[^/]+$/, {
      timeout: 2 * 60_000,
    });
    expect(starts).toHaveLength(1);
    expect(starts[0].arguments).toMatchObject({ noWorkspace: true });
    expect(starts[0].arguments).not.toHaveProperty('workspaceGrant');
  } catch (error) {
    failure = error;
  }
  await setDefaultWorkspace(admin, labAgent, undefined);
  if (failure !== undefined) {
    throw failure;
  }
});
