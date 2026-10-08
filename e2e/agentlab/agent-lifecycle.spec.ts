import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  open,
  startSessionOnReadyAgent,
  test,
} from './fixtures';

/**
 * The whole journey a person takes through the Dev Portal's Agent Platform,
 * as the lab admin: create an agent in the wizard (Details → Skills → Tools →
 * Review → Deploy), watch it become ready on the platform Harness, start a
 * session from its page (the dialog cannot be dismissed while the create is
 * on its way), get an answer to a first message, and delete the agent again.
 * Each step is the portal's own path: the review is agent-manager's dry run,
 * Deploy its `create_agent`, both through muster as the person; the turn
 * streams from kagent.
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

test('agent lifecycle: a system prompt past the limit stays on Details', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/agents/new');
  await expect(admin.getByText('Step 1 of 4: Details')).toBeVisible();
  const field = admin.getByRole('textbox', { name: 'System prompt' });
  await field.fill('a'.repeat(20001));
  await expect(admin.getByText('20,001 / 20,000 characters')).toBeVisible();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await admin.getByRole('button', { name: 'Continue' }).first().click();
  await expect(
    admin.getByText('Step 1 of 4: Details'),
    'a prompt past the limit never reaches the dry run',
  ).toBeVisible();
  await expect(
    admin
      .getByText(/System prompt is 20,001 characters; the limit is 20,000/)
      .first(),
  ).toBeVisible();
});

test('agent lifecycle: create in the wizard, become ready, chat, delete', async ({
  admin,
}) => {
  test.setTimeout(12 * 60_000);

  const detailPath = await createAgentInWizard(admin, agentName, agentSlug);
  const deleteAgent = () => deleteAgentInPortal(admin, detailPath, agentSlug);

  let failure: unknown;
  try {
    await startSessionOnReadyAgent(admin, prompt, async dialog => {
      await admin.keyboard.press('Escape');
      await dialog.getByRole('button', { name: 'Close' }).click();
      await expect(
        dialog,
        'neither Escape nor the header’s X closes the dialog while the create is on its way',
      ).toBeVisible();
    });
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
