import type { Page, Route } from '@playwright/test';

import { expect, open, test, type LabAgent } from './fixtures';

/**
 * The Edit agent page's two write modes on the worker's own agent: an agent
 * written live keeps Save, one applied from git dry-runs in mode commit and
 * offers Commit — a pull request in the repository that owns it — in place of
 * Save, locked once the pull request is open.
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
 * pull requests, and records every `update_agent` the page sends.
 */
async function stageGitOpsAgent(page: Page): Promise<ToolCall[]> {
  const writes: ToolCall[] = [];
  await page.route('**/api/muster/call**', async (route: Route) => {
    const call = route.request().postDataJSON() as ToolCall;
    switch (call?.name) {
      case 'x_agent-manager_get_info': {
        const info = await (await route.fetch()).json();
        await route.fulfill({
          json: {
            ...info,
            capabilities: { ...info.capabilities, commit: true },
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
