import {
  createAgentInWizard,
  deleteAgentInPortal,
  dismissInboxToasts,
  expect,
  open,
  startSessionOnReadyAgent,
  test,
} from './fixtures';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';

/**
 * Change Harness on an agent's page (D9), as the lab admin: an agent created
 * on the platform Harness with the lab's Anthropic model, one session with it,
 * then the Agent actions menu's Change Harness.
 *
 * - Towards codex the dialog lists agent-manager's refusal (Codex speaks the
 *   OpenAI Responses API only) and blocks the change.
 * - Towards Claude Code every check passes: the change lands, the toast says
 *   running sessions stay where they are, and the page follows the new
 *   revision until it is Ready.
 * - The session from before the change is marked "Earlier revision" on the
 *   Sessions tab and still answers; a session started after it is not marked.
 *
 * Needs a lab with the `claude` and `codex` coding Harnesses in `kagent`
 * (`agentlab configure --coding --coding-harnesses claude,codex`) and an
 * agent-manager that takes `harness` on `update_agent` (2.7.0 or later).
 */

test.describe.configure({ mode: 'serial' });

const NAMESPACE = 'kagent';
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const agentName = `E2E Change Harness ${stamp}`;
const agentSlug = `e2e-change-harness-${stamp}`;

/** Why the lab cannot run this spec, or undefined when it can. */
async function missingHarnesses(): Promise<string | undefined> {
  const { stdout } = await kubectl([
    '-n',
    NAMESPACE,
    'get',
    'harnesses.api.kagent.dev',
    '-o',
    'jsonpath={.items[*].metadata.name}',
  ]);
  const names = new Set(stdout.split(/\s+/).filter(Boolean));
  const missing = ['claude', 'codex'].filter(name => !names.has(name));
  return missing.length
    ? `the lab offers no ${missing.join(' or ')} Harness in ${NAMESPACE}`
    : undefined;
}

test('change Harness: refused towards codex, moved to Claude Code, the earlier session marked and still answering', async ({
  admin,
}) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  const missing = await missingHarnesses();
  test.skip(missing !== undefined, missing ?? '');
  test.setTimeout(20 * 60_000);

  const detailPath = await createAgentInWizard(admin, agentName, agentSlug);

  let failure: unknown;
  try {
    // --- A session on the platform Harness ---------------------------------
    await startSessionOnReadyAgent(
      admin,
      'Reply with exactly the single word ALPHA and nothing else.',
    );
    await expect(
      admin.getByTestId('timeline-agent-message').filter({ hasText: 'ALPHA' }),
      'the agent answers on the platform Harness',
    ).toBeVisible({ timeout: 3 * 60_000 });
    const earlierSession = new URL(admin.url()).pathname;

    // --- Change Harness: codex refused -------------------------------------
    await dismissInboxToasts(admin);
    await open(admin, detailPath);
    const facts = admin.getByRole('complementary', {
      name: 'About this agent',
    });
    await expect(
      facts,
      "the facts name the runtime in the create form's words",
    ).toContainText('Platform default');
    await admin.getByRole('button', { name: 'Agent actions' }).click();
    await admin.getByRole('menuitem', { name: 'Change Harness…' }).click();
    const dialog = admin.getByRole('dialog', { name: /Change the Harness/ });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('radio', { name: /current runtime/ }),
      'the platform Harness is the current runtime and cannot be picked',
    ).toHaveAttribute('aria-disabled', 'true');

    await dialog.getByRole('radio', { name: /Harness codex\b/ }).click();
    await expect(
      dialog.getByRole('list', { name: 'Violations' }),
      "agent-manager's dry run refuses the Anthropic model towards codex",
    ).toContainText('speaks the OpenAI Responses API only', {
      timeout: 60_000,
    });
    await expect(
      dialog.getByRole('link', { name: 'Edit the agent' }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Change Harness' }),
    ).toBeDisabled();

    // --- Change Harness: Claude Code ---------------------------------------
    await dialog.getByRole('radio', { name: /Harness claude\b/ }).click();
    await expect(dialog.getByText(/Every check passes/)).toBeVisible({
      timeout: 60_000,
    });
    await dialog.getByRole('button', { name: 'Change Harness' }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
    await expect(
      admin.getByText(/Running Sessions stay on .* until you delete them/),
      'the toast says the running sessions stay on the runtime they started on',
    ).toBeVisible();
    await expect(
      admin.getByText(/The agent is ready on Harness claude \(runtime changed/),
      'the page follows the new revision until it is Ready on Claude Code',
    ).toBeVisible({ timeout: 6 * 60_000 });
    await expect(facts, 'the facts follow the new runtime').toContainText(
      'Harness claude',
    );
    await expect(facts).not.toContainText('Platform default');

    // --- The earlier session: marked, and still answering --------------------
    await open(admin, `${detailPath}/sessions`);
    const marked = admin
      .getByRole('row')
      .filter({ has: admin.getByText('Earlier revision', { exact: true }) });
    await expect(
      marked,
      'the session from before the change runs on an earlier revision',
    ).toHaveCount(1, { timeout: 60_000 });

    await open(admin, earlierSession);
    const message = admin.getByRole('textbox', { name: 'Message' });
    await message.fill(
      'Reply with exactly the single word BRAVO and nothing else.',
    );
    await admin.getByRole('button', { name: 'Send' }).click();
    await expect(
      admin.getByTestId('timeline-agent-message').filter({ hasText: 'BRAVO' }),
      'the earlier session still answers, on the revision it started on',
    ).toBeVisible({ timeout: 3 * 60_000 });

    // --- A new session runs on the current revision ------------------------
    await open(admin, detailPath);
    await startSessionOnReadyAgent(
      admin,
      'Reply with exactly the single word CHARLIE and nothing else.',
    );
    await expect(
      admin
        .getByTestId('timeline-agent-message')
        .filter({ hasText: 'CHARLIE' }),
      'a new session answers on Claude Code',
    ).toBeVisible({ timeout: 5 * 60_000 });
    await open(admin, `${detailPath}/sessions`);
    await expect(
      admin.getByRole('row').filter({ hasText: /Reply with exactly/ }),
    ).toHaveCount(2, { timeout: 60_000 });
    await expect(
      marked,
      'only the session from before the change is marked',
    ).toHaveCount(1);
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
