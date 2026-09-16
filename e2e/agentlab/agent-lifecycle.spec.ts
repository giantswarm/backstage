import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The whole journey a person takes through the Dev Portal's Agent Platform,
 * as the lab admin: create an agent in the wizard (Details → Skills → Tools →
 * Review → Deploy), watch it become ready on the platform Harness, start a
 * session from its page, get an answer to a first message, and delete the
 * agent again. Each step is the portal's own path: the review is
 * agent-manager's dry run, Deploy its `create_agent`, both through muster as
 * the person; the turn streams from kagent.
 *
 * Seconds on a warm lab (the Go ADK boots an agent in about twenty), minutes
 * on a cold worker — the waits allow for the latter. `--grep-invert lifecycle`
 * leaves it out when only the pages are in question.
 */

test.describe.configure({ mode: 'serial' });

// A name unique to the run, so a failed run's leftover never collides with
// the next one's agent and is easy to find in the roster.
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const agentName = `E2E Lifecycle ${stamp}`;
const agentSlug = `e2e-lifecycle-${stamp}`;
const prompt = 'Reply with exactly the single word PONG and nothing else.';

test('agent lifecycle: create in the wizard, become ready, chat, delete', async ({
  admin,
}) => {
  test.setTimeout(12 * 60_000);

  // --- Step 1: Details -----------------------------------------------------
  await open(admin, '/agent-platform/agents/new');
  await expect(admin.getByText('Step 1 of 4: Details')).toBeVisible();
  await expect(
    admin.getByText('No installations with models'),
    `the wizard sees no reachable installation with a ModelConfig — the lab's kagent route may be unreachable from Backstage, or the backend cached an unreachable probe after a pod roll (5 min TTL)`,
  ).toBeHidden();
  await admin.getByRole('textbox', { name: 'Name' }).fill(agentName);
  await expect(admin.getByRole('textbox', { name: 'Slug' })).toHaveValue(
    agentSlug,
  );
  await admin
    .getByRole('textbox', { name: 'Description' })
    .fill('Throwaway agent of the Playwright suite; deleted by the same run.');
  await admin
    .getByRole('textbox', { name: 'System prompt' })
    .fill('You are a test agent. Answer with exactly what you are asked for.');
  await admin
    .getByRole('radiogroup', { name: 'Model' })
    .getByRole('radio', { name: /default-model-config/ })
    .check();
  await admin.getByRole('button', { name: 'Continue' }).first().click();

  // --- Step 2: Skills (none) -----------------------------------------------
  await expect(admin.getByText('Step 2 of 4: Skills')).toBeVisible();
  await admin.getByRole('button', { name: 'Continue' }).first().click();

  // --- Step 3: Tools (none) ------------------------------------------------
  await expect(admin.getByText('Step 3 of 4: Tools')).toBeVisible();
  await expect(
    admin.getByLabel('Selected so far').getByText('No tools'),
    'nothing selected is the empty toolset, and the step says so',
  ).toBeVisible();
  await admin.getByRole('button', { name: 'Continue' }).first().click();

  // --- Step 4: Review = agent-manager's dry run, then Deploy ---------------
  await expect(admin.getByText('Step 4 of 4: Review')).toBeVisible();
  await expect(admin.getByText(agentSlug).first()).toBeVisible();
  const deploy = admin.getByRole('button', { name: 'Deploy agent' }).first();
  await expect(
    deploy,
    'the dry run through agent-manager completed and Deploy is offered',
  ).toBeEnabled({ timeout: 90_000 });
  await deploy.click();

  // The review page hands the agent to its detail page, which reports the
  // verdict agent-manager polls for it. From here on the agent exists and the
  // run deletes it again, whatever happens in between.
  await expect(admin).toHaveURL(
    new RegExp(
      `/agent-platform/agents/${lab.installation}/[^/]+/${agentSlug}$`,
    ),
    { timeout: 60_000 },
  );
  const detailURL = admin.url();

  // Deletes the agent through its actions menu — the portal's own path.
  const deleteAgent = async () => {
    await open(admin, new URL(detailURL).pathname);
    await admin.getByRole('button', { name: 'Agent actions' }).click();
    await admin.getByRole('menuitem', { name: /Delete agent/ }).click();
    const dialog = admin.getByRole('dialog', { name: /Delete agent/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete agent' }).click();
    await expect(admin).toHaveURL(/\/agent-platform\/agents$/, {
      timeout: 60_000,
    });
    await expect(
      admin.getByRole('link', { name: agentSlug }),
      'the roster no longer lists the agent',
    ).toBeHidden({ timeout: 60_000 });
  };

  let failure: unknown;
  try {
    // The Status card's verdict — the page's own derivation from the
    // template's harness status, `Pending` until the golden boot is done.
    // `.last()`: the page's own article wraps the cards, so the filter also
    // matches it — the card is the innermost match.
    const statusCard = admin
      .getByRole('article')
      .filter({
        has: admin.getByRole('heading', { level: 3, name: 'Status' }),
      })
      .last();
    await expect(statusCard).toBeVisible();
    await expect(
      statusCard.getByText('Ready', { exact: true }).first(),
      'the agent becomes ready on the platform Harness (golden boot) — a Pending that never ends means the lab Harness is not admitting: `kubectl -n kagent get harness,workerpools` and the kagent-controller log',
    ).toBeVisible({ timeout: 6 * 60_000 });

    // --- Start a session from the agent's page and get an answer -----------
    await admin.getByRole('button', { name: 'Start a session' }).click();
    const promptBox = admin.getByRole('textbox', { name: 'Prompt' });
    await expect(promptBox).toBeVisible();
    await promptBox.fill(prompt);
    // Exact: the page header's "Start a session" is a button too.
    await admin.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(admin).toHaveURL(
      new RegExp(`/agent-platform/sessions/${lab.installation}/[^/]+$`),
      { timeout: 60_000 },
    );
    await expect(
      admin.getByTestId('timeline-user-message').getByText(prompt),
      "the person's message is on the timeline",
    ).toBeVisible();
    await expect(
      admin.getByText(/PONG/).nth(1),
      "the agent's answer arrives on the timeline",
    ).toBeVisible({ timeout: 3 * 60_000 });
    await expect(
      admin.getByRole('button', { name: 'Send' }),
      'the composer offers Send again once the turn is over',
    ).toBeVisible({ timeout: 60_000 });
  } catch (error) {
    failure = error;
  }

  // --- Delete the agent, and report the journey's own failure first ---------
  try {
    await deleteAgent();
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
