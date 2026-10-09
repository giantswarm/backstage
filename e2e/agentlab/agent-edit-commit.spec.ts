import type { Page, Route } from '@playwright/test';

import { expect, open, test, type LabAgent } from './fixtures';

/**
 * The Edit agent page's two write modes on the worker's own agent: an agent
 * written live keeps Save, one applied from git dry-runs in mode commit and
 * offers Commit — a pull request in the repository that owns it — in place of
 * Save, locked once the pull request is open. The agent detail page's three
 * ways to it — the actions menu, the Skills tab's Add skills and the failure
 * blocker — offer it for an agent applied from git only when agent-manager can
 * commit.
 *
 * The lab's agent-manager writes live only: it reports no commit capability,
 * and no Flux Kustomization applies the fixture agent from git. The commit
 * path therefore stages exactly those answers at the browser, in
 * agent-manager's shape — `get_agent`'s `managed: gitops`, `get_info`'s
 * `capabilities.commit`, and `update_agent`'s pull request — while the read
 * of the agent and the dry run itself still come from the lab's agent-manager
 * (the dry run asked in mode apply, the one it can answer on a live release).
 */

const DESCRIPTION = 'Edited by the agent-edit-commit spec.';
const PULL_REQUEST = 'https://github.com/giantswarm/agents/pull/4242';

type ToolCall = { name?: string; arguments?: Record<string, unknown> };

function editPathOf(agent: LabAgent): string {
  return `${agent.detailPath}/edit`;
}

/** The footer card's write button: the header carries its twin. */
function writeButton(page: Page, name: RegExp) {
  return page.getByRole('button', { name }).last();
}

async function changeDescription(page: Page) {
  const description = page.getByRole('textbox', { name: 'Description' });
  await expect(
    description,
    'the form is pre-filled from get_agent',
  ).toBeVisible({ timeout: 60_000 });
  await description.fill(DESCRIPTION);
  await expect(
    page.getByRole('list', { name: 'Changed fields' }).getByText('Description'),
  ).toBeVisible();
  await expect(
    page.getByText(`description: ${DESCRIPTION}`).first(),
    "agent-manager's dry run composes the changed values",
  ).toBeVisible({ timeout: 60_000 });
}

/**
 * Stages the agent as applied from git on an agent-manager that can open
 * pull requests (or, with `canCommit: false`, cannot), and records every
 * `update_agent` the page sends.
 */
async function stageGitOpsAgent(
  page: Page,
  { canCommit = true }: { canCommit?: boolean } = {},
): Promise<ToolCall[]> {
  const writes: ToolCall[] = [];
  await page.route('**/api/muster/call**', async (route: Route) => {
    const call = route.request().postDataJSON() as ToolCall;
    switch (call?.name) {
      case 'x_agent-manager_get_info': {
        const info = await (await route.fetch()).json();
        await route.fulfill({
          json: {
            ...info,
            capabilities: { ...info.capabilities, commit: canCommit },
          },
        });
        return;
      }
      case 'x_agent-manager_get_agent': {
        const agent = await (await route.fetch()).json();
        await route.fulfill({
          json: {
            ...agent,
            managed: 'gitops',
            helmRelease: { ...agent.helmRelease, gitOpsOwned: true },
          },
        });
        return;
      }
      case 'x_agent-manager_validate_agent': {
        expect(
          call.arguments?.mode,
          'the dry run of an agent applied from git is asked in mode commit',
        ).toBe('commit');
        const { mode: _mode, ...asLive } = call.arguments ?? {};
        await route.continue({
          postData: JSON.stringify({ ...call, arguments: asLive }),
        });
        return;
      }
      case 'x_agent-manager_update_agent': {
        writes.push(call);
        await route.fulfill({
          json: {
            mode: 'commit',
            dryRun: false,
            commit: {
              repository: 'giantswarm/agents',
              base: 'main',
              directory: 'flux/agent-manager',
              kustomization: 'flux-giantswarm/agents',
              prune: true,
              branch: 'agent-manager/update-kagent-agent',
              files: [
                { path: 'flux/agent-manager/agent.yaml', action: 'update' },
              ],
              pullRequest: PULL_REQUEST,
              number: 4242,
              author: 'lab-admin',
            },
          },
        });
        return;
      }
      default:
        await route.fallback();
    }
  });
  return writes;
}

test('agent edit: an agent written live keeps Save and offers no Commit', async ({
  admin,
  labAgent,
}) => {
  await open(admin, editPathOf(labAgent));
  await changeDescription(admin);

  await expect(writeButton(admin, /^Save/)).toBeEnabled({ timeout: 60_000 });
  await expect(admin.getByRole('button', { name: /^Commit/ })).toHaveCount(0);
});

test('agent edit: an agent applied from git dry-runs in mode commit and opens one pull request', async ({
  admin,
  labAgent,
}) => {
  const writes = await stageGitOpsAgent(admin);
  await open(admin, editPathOf(labAgent));
  await changeDescription(admin);

  await expect(admin.getByRole('button', { name: /^Save/ })).toHaveCount(0);
  const commit = writeButton(admin, /^Commit/);
  await expect(commit).toBeEnabled({ timeout: 60_000 });
  await commit.click();

  await expect(
    admin.getByRole('link', { name: /Open the pull request/ }),
  ).toHaveAttribute('href', PULL_REQUEST);
  const committed = writeButton(admin, /^Committed/);
  await expect(committed, 'Commit is locked for this change').toBeDisabled();
  // A second click on the locked button opens no second pull request.
  await committed.click({ force: true });
  expect(writes).toHaveLength(1);
  expect(writes[0].arguments).toMatchObject({
    name: labAgent.slug,
    description: DESCRIPTION,
    mode: 'commit',
  });
  await expect(admin, 'nothing changed live: the page stays').toHaveURL(
    new RegExp(`${editPathOf(labAgent)}$`),
  );
});

/**
 * Stages the lab agent as failed on a cause in its spec — a ModelConfig that
 * does not resolve — which is what makes the failure blocker offer Edit agent.
 */
async function stageFailedAgent(page: Page, agent: LabAgent) {
  await page.route('**/api/kubernetes/proxy/**', async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const body = await response.json().catch(() => undefined);
    if (body?.kind !== 'Agent' || body.metadata?.name !== agent.slug) {
      await route.fulfill({ response });
      return;
    }
    const at = new Date().toISOString();
    const blocked = (type: string) => ({
      type,
      status: 'False',
      reason: 'Blocked',
      message: 'blocked by ResolvedRefs',
      lastTransitionTime: at,
    });
    await route.fulfill({
      response,
      json: {
        ...body,
        status: {
          ...body.status,
          observedGeneration: body.metadata.generation,
          latestSuccessfulRevision: undefined,
          conditions: [
            {
              type: 'Accepted',
              status: 'True',
              reason: 'Accepted',
              message: 'Harness runs this template',
              lastTransitionTime: at,
            },
            {
              type: 'ResolvedRefs',
              status: 'False',
              reason: 'ReferenceResolutionFailed',
              message: 'resolve ModelConfig "e2e-missing": not found',
              lastTransitionTime: at,
            },
            blocked('Compatible'),
            blocked('Ready'),
          ],
        },
      },
    });
  });
}

async function expectCommitModeEditPage(page: Page, agent: LabAgent) {
  await expect(page).toHaveURL(new RegExp(`${editPathOf(agent)}$`));
  await changeDescription(page);
  await expect(
    writeButton(page, /^Commit/),
    'the edit page opened in commit mode',
  ).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: /^Save/ })).toHaveCount(0);
}

const blockerEdit = (page: Page) =>
  page.getByRole('button', { name: 'Edit agent', exact: true });

test('agent edit: every entry point opens the commit-mode Edit page for an agent applied from git', async ({
  admin,
  labAgent,
}) => {
  await stageGitOpsAgent(admin);
  await stageFailedAgent(admin, labAgent);

  // The failure blocker.
  await open(admin, labAgent.detailPath);
  await expect(admin.getByText("Sessions can't start")).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    admin.getByText(/so a fix opens a pull request there/),
  ).toBeVisible();
  await blockerEdit(admin).click();
  await expectCommitModeEditPage(admin, labAgent);

  // The actions menu.
  await open(admin, labAgent.detailPath);
  await admin.getByRole('button', { name: 'Agent actions' }).click();
  await expect(
    admin.getByRole('menuitem', { name: /Update skills/ }),
    'Update skills has no commit mode',
  ).toHaveCount(0);
  await admin.getByRole('menuitem', { name: /Edit agent/ }).click();
  await expectCommitModeEditPage(admin, labAgent);

  // The Skills tab's Add skills: the lab agent has none.
  await open(admin, `${labAgent.detailPath}/skills`);
  await expect(
    admin.getByText(/so adding skills opens a pull request there/),
  ).toBeVisible({ timeout: 60_000 });
  await admin.getByRole('button', { name: 'Add skills' }).click();
  await expectCommitModeEditPage(admin, labAgent);
});

test('agent edit: an agent applied from git offers no Edit without the commit capability', async ({
  admin,
  labAgent,
}) => {
  await stageGitOpsAgent(admin, { canCommit: false });
  await stageFailedAgent(admin, labAgent);

  await open(admin, labAgent.detailPath);
  await expect(admin.getByText(/so it is fixed there/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(blockerEdit(admin)).toHaveCount(0);

  await admin.getByRole('button', { name: 'Agent actions' }).click();
  await expect(
    admin.getByRole('menuitem', { name: 'View manifest' }),
  ).toBeVisible();
  await expect(admin.getByRole('menuitem', { name: /Edit agent/ })).toHaveCount(
    0,
  );
  await admin.keyboard.press('Escape');

  await open(admin, `${labAgent.detailPath}/skills`);
  await expect(admin.getByText(/so its skills are added there/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(admin.getByRole('button', { name: 'Add skills' })).toHaveCount(
    0,
  );
});
