import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  startSessionOnReadyAgent,
  test,
} from './fixtures';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';

/**
 * A coding agent on the codex Harness, created in the wizard, answers a turn,
 * and its session shows what the turn used the way a claude one does: the
 * session views read the usage on the turn's final task status and do not
 * branch on the runtime. Codex reports tokens and no price, so the cost chip
 * lists the tokens and the estimate, and no reported cost.
 *
 * Needs a lab offering codex: the `codex` Harness (kagent 1.14 or later, whose
 * codex runtime writes the turn's usage) and a ModelConfig in the Responses
 * API format, `AGENTLAB_CODEX_MODEL` (default `codex-mock`, the lab's
 * in-cluster mock model on the LLM listener's OpenAI route). The mock answers
 * one scripted prompt only, `AGENTLAB_CODEX_PROMPT`'s default; a real model
 * takes any. Skips on a lab without either.
 */

test.describe.configure({ mode: 'serial' });

const MODEL = process.env.AGENTLAB_CODEX_MODEL ?? 'codex-mock';
const PROMPT =
  process.env.AGENTLAB_CODEX_PROMPT ?? 'Run the requested shell command.';
const NAMESPACE = 'kagent';

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const agentName = `E2E Codex Turn ${stamp}`;
const agentSlug = `e2e-codex-turn-${stamp}`;

/**
 * The wizard's name for the codex model (its display name, else its own), or
 * why the lab cannot run a codex turn.
 */
async function codexModel(): Promise<{ label: string } | { missing: string }> {
  const { stdout } = await kubectl([
    '-n',
    NAMESPACE,
    'get',
    'harnesses.api.kagent.dev,modelconfigs.api.kagent.dev',
    '-o',
    'jsonpath={range .items[*]}{.kind}/{.metadata.name}\t{.metadata.annotations.ui\\.giantswarm\\.io/display-name}{"\\n"}{end}',
  ]);
  const objects = new Map(
    stdout
      .split('\n')
      .filter(Boolean)
      .map(line => line.split('\t') as [string, string]),
  );
  if (!objects.has('Harness/codex')) {
    return { missing: `the lab offers no codex Harness in ${NAMESPACE}` };
  }
  if (!objects.has(`ModelConfig/${MODEL}`)) {
    return {
      missing: `the lab has no ModelConfig ${MODEL} in ${NAMESPACE} (AGENTLAB_CODEX_MODEL)`,
    };
  }
  return { label: objects.get(`ModelConfig/${MODEL}`) || MODEL };
}

test('a codex agent from the wizard answers a turn, and its session shows the usage', async ({
  admin,
}) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  const model = await codexModel();
  test.skip('missing' in model, 'missing' in model ? model.missing : '');
  test.setTimeout(15 * 60_000);

  const detailPath = await createAgentInWizard(admin, agentName, agentSlug, {
    harness: /^Codex, Harness codex\b/,
    model: `Select model ${'label' in model ? model.label : MODEL}`,
  });

  let failure: unknown;
  try {
    await startSessionOnReadyAgent(admin, PROMPT);
    await expect(
      admin.getByTestId('timeline-agent-message').first(),
      "the codex agent's answer arrives on the timeline",
    ).toBeVisible({ timeout: 5 * 60_000 });
    await expect(
      admin.getByRole('button', { name: 'Send' }),
      'the composer offers Send again once the turn is over',
    ).toBeVisible({ timeout: 60_000 });

    await admin
      .getByRole('button', { name: /^Session cost and context/ })
      .click();
    const costs = admin.getByRole('dialog', {
      name: 'Session cost and context',
    });
    await expect(
      costs,
      "the codex turn's tokens, read off its final task status",
    ).toContainText(/Tokens in \/ out\s*[1-9][\d.,]*k?\s*\/\s*[1-9]/, {
      timeout: 60_000,
    });
    await expect(costs).toContainText(/Turns\s*1(?!\d)/);
    await expect(
      costs.getByText('Reported cost'),
      'codex reports no price, so no reported cost is shown',
    ).toHaveCount(0);
    await test.info().attach('the codex session cost chip', {
      body: await costs.screenshot(),
      contentType: 'image/png',
    });
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
