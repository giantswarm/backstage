import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  startSessionOnReadyAgent,
  test,
} from './fixtures';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';

/**
 * A coding agent on the oh-my-pi (omp) Harness, picked in the wizard by the
 * Harness's display name, answers a turn, and its session shows what the turn
 * used and cost. omp runs as a BYO Harness (`spec.byo`, the kagent line's
 * omp-harness image), so the card is titled by the Harness's
 * `ui.giantswarm.io/display-name`, "oh-my-pi", which the kagent chart renders
 * from the `harnesses[]` entry. omp takes claude's Anthropic-protocol
 * ModelConfig and reports a price per turn, so the cost chip lists the tokens
 * and a reported cost.
 *
 * Needs a lab offering omp: the `omp` Harness (`agentlab configure --coding
 * --coding-harnesses claude,omp --coding-images omp=<digest>`) and an Anthropic
 * ModelConfig, `AGENTLAB_OMP_MODEL` (default `default-model-config`). Skips on
 * a lab without either.
 */

test.describe.configure({ mode: 'serial' });

const MODEL = process.env.AGENTLAB_OMP_MODEL ?? 'default-model-config';
const PROMPT =
  process.env.AGENTLAB_OMP_PROMPT ??
  'Reply with the single word "ready" and nothing else.';
const NAMESPACE = 'kagent';
const DISPLAY_NAME = 'oh-my-pi';

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const agentName = `E2E Omp Turn ${stamp}`;
const agentSlug = `e2e-omp-turn-${stamp}`;

/**
 * The wizard's name for the omp model (its display name, else its own), or
 * why the lab cannot run an omp turn.
 */
async function ompModel(): Promise<{ label: string } | { missing: string }> {
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
  if (!objects.has('Harness/omp')) {
    return { missing: `the lab offers no omp Harness in ${NAMESPACE}` };
  }
  if (objects.get('Harness/omp') !== DISPLAY_NAME) {
    return {
      missing: `the omp Harness in ${NAMESPACE} is not titled "${DISPLAY_NAME}" (ui.giantswarm.io/display-name)`,
    };
  }
  if (!objects.has(`ModelConfig/${MODEL}`)) {
    return {
      missing: `the lab has no ModelConfig ${MODEL} in ${NAMESPACE} (AGENTLAB_OMP_MODEL)`,
    };
  }
  return { label: objects.get(`ModelConfig/${MODEL}`) || MODEL };
}

test('an omp agent from the "oh-my-pi" card answers a turn, and its session shows the reported cost', async ({
  admin,
}) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  const model = await ompModel();
  test.skip('missing' in model, 'missing' in model ? model.missing : '');
  test.setTimeout(15 * 60_000);

  const detailPath = await createAgentInWizard(admin, agentName, agentSlug, {
    harness: /^oh-my-pi, Harness omp\b/,
    model: `Select model ${'label' in model ? model.label : MODEL}`,
  });

  let failure: unknown;
  try {
    await startSessionOnReadyAgent(admin, PROMPT);
    await expect(
      admin.getByTestId('timeline-agent-message').first(),
      "the omp agent's answer arrives on the timeline",
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
      "the omp turn's tokens, read off its final task status",
    ).toContainText(/Tokens in \/ out\s*[1-9][\d.,]*k?\s*\/\s*[1-9]/, {
      timeout: 60_000,
    });
    await expect(costs).toContainText(/Turns\s*1(?!\d)/);
    await expect(
      costs.getByText('Reported cost'),
      'omp reports the turn’s price, so the reported cost is shown',
    ).toBeVisible();
    await test.info().attach('the omp session cost chip', {
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
