import type { Page } from '@playwright/test';
import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  startSessionOnReadyAgent,
  test,
} from './fixtures';

/**
 * A Harness carries no per-turn budget or turn cap: the wizard's runtime
 * picker, the review and the agent's status card show no limits for an agent
 * on the lab's Claude Code Harness (`claude`). What a turn spent still shows:
 * the claude runtime reports its cost on the turn's final task status, and the
 * session's cost chip lists it as the reported cost.
 *
 * Needs the lab's `claude` Harness (agent-platform's coding agents) and a
 * working Anthropic key behind `default-model-config`; one short turn.
 */

test.describe.configure({ mode: 'serial' });

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const agentName = `E2E No Limits ${stamp}`;
const agentSlug = `e2e-no-limits-${stamp}`;
const prompt = 'Reply with exactly the single word PONG and nothing else.';

async function expectNoLimits(page: Page, where: string) {
  await expect(
    page.getByRole('group', { name: 'Limits' }),
    `${where} shows no Harness limits`,
  ).toHaveCount(0);
  await expect(
    page.getByText(/Budget per turn|Max steps per turn|No limits set/),
    `${where} names no per-turn limit`,
  ).toHaveCount(0);
}

test('a Claude Code agent shows no limits, and its turn its reported cost', async ({
  admin,
}) => {
  test.setTimeout(15 * 60_000);

  const detailPath = await createAgentInWizard(admin, agentName, agentSlug, {
    harness: /Harness claude\b/,
    onStep: async step => {
      await expectNoLimits(admin, `the wizard's ${step} step`);
    },
  });

  let failure: unknown;
  try {
    await expect(
      admin.getByText(/Runs on claude|Sessions run on claude/),
    ).toBeVisible({ timeout: 60_000 });
    await expectNoLimits(admin, "the agent's status card");

    await startSessionOnReadyAgent(admin, prompt);
    await expect(
      admin.getByTestId('timeline-agent-message').filter({ hasText: 'PONG' }),
      "the agent's answer arrives on the timeline",
    ).toBeVisible({ timeout: 5 * 60_000 });
    await expect(
      admin.getByRole('button', { name: 'Send' }),
      'the composer offers Send again once the turn is over',
    ).toBeVisible({ timeout: 60_000 });

    // The chip's popover: the claude runtime's own figure beside the estimate.
    await admin
      .getByRole('button', { name: /^Session cost and context/ })
      .click();
    const costs = admin.getByRole('dialog', {
      name: 'Session cost and context',
    });
    await expect(
      costs.getByText('Reported cost'),
      'the claude turn reported its cost on its final task status',
    ).toBeVisible({ timeout: 60_000 });
    await expect(costs).toContainText(/Reported cost\s*\$\d/);
  } catch (error) {
    failure = error;
  }

  try {
    await deleteAgentInPortal(admin, detailPath, agentSlug);
  } catch (cleanupError) {
    if (failure === undefined) {
      throw cleanupError;
    }
    if (failure instanceof Error) {
      failure.message += `\n\n[cleanup] deleting ${agentSlug} through the portal failed too — remove it by hand (\`kubectl -n kagent delete helmrelease ${agentSlug}\`): ${String(
        cleanupError,
      )}`;
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
});
