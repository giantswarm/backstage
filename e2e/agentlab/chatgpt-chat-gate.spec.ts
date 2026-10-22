import type { Request, Route } from '@playwright/test';

import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  startSessionOnReadyAgent,
  test,
} from './fixtures';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';

/**
 * An agent on the person's own ChatGPT subscription takes no turn until the
 * person has connected it: a codex agent on "ChatGPT (your subscription)"
 * (a ModelConfig with `openAI.credentialType: chatgptOAuth` and no
 * `apiKeySecret`), created in the wizard, holds the first message of its
 * session behind the connect prompt, and sends it once muster reports the
 * person's `chatgpt` App connected. The connection is staged at the browser
 * in muster's own `auth://status` shape, since it is a real ChatGPT sign-in;
 * what the turn then does is the credential provider's, not this spec's.
 *
 * Needs a lab offering it: the `codex` Harness and such a ModelConfig
 * (`AGENTLAB_CHATGPT_MODEL`, default `chatgpt-subscription`). Skips without.
 */

test.describe.configure({ mode: 'serial' });

const MODEL = process.env.AGENTLAB_CHATGPT_MODEL ?? 'chatgpt-subscription';
const NAMESPACE = 'kagent';
const PROMPT = 'Say hello.';
const REASON = 'Connect your ChatGPT subscription to talk to this agent.';

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const agentName = `E2E ChatGPT Gate ${stamp}`;
const agentSlug = `e2e-chatgpt-gate-${stamp}`;

/** Why the lab cannot run this, or nothing. */
async function missing(): Promise<string | undefined> {
  const { stdout } = await kubectl([
    '-n',
    NAMESPACE,
    'get',
    'harnesses.api.kagent.dev,modelconfigs.api.kagent.dev',
    '-o',
    'jsonpath={range .items[*]}{.kind}/{.metadata.name}\t{.spec.openAI.credentialType}\t{.spec.apiKeySecret}{"\\n"}{end}',
  ]);
  const lines = stdout.split('\n').filter(Boolean);
  if (!lines.some(line => line.startsWith('Harness/codex\t'))) {
    return `the lab offers no codex Harness in ${NAMESPACE}`;
  }
  const model = lines.find(line => line.startsWith(`ModelConfig/${MODEL}\t`));
  const [, credentialType, secret] = model?.split('\t') ?? [];
  if (credentialType !== 'chatgptOAuth' || secret) {
    return `the lab has no person's ChatGPT ModelConfig ${MODEL} in ${NAMESPACE} (chatgptOAuth without apiKeySecret; AGENTLAB_CHATGPT_MODEL)`;
  }
  return undefined;
}

test("an agent on the person's ChatGPT subscription holds the first message until they connect", async ({
  admin,
}) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  const reason = await missing();
  test.skip(Boolean(reason), reason ?? '');
  test.setTimeout(15 * 60_000);

  // The person's chatgpt App, connected once `connected` says so.
  let connected = false;
  const status = async (route: Route) => {
    const answer = await (await route.fetch()).json();
    const apps: Array<{ name: string; status: string }> =
      answer?.providerApps ?? [];
    await route.fulfill({
      json: {
        ...answer,
        providerApps: [
          ...apps.filter(app => app.name !== 'chatgpt'),
          {
            name: 'chatgpt',
            status: connected ? 'connected' : 'auth_required',
          },
        ],
      },
    });
  };
  await admin.route('**/api/muster/auth/status**', status);
  const turns: Request[] = [];
  const onRequest = (request: Request) => {
    if (
      request.method() === 'POST' &&
      /\/sessions\/[^/]+\/messages(\/stream)?$/.test(
        new URL(request.url()).pathname,
      )
    ) {
      turns.push(request);
    }
  };
  admin.on('request', onRequest);

  const detailPath = await createAgentInWizard(admin, agentName, agentSlug, {
    harness: /^Codex, Harness codex\b/,
    // The picker names the person's ChatGPT login so, whatever the
    // ModelConfig is called.
    model: 'Select model ChatGPT (your subscription)',
  });

  let failure: unknown;
  try {
    await startSessionOnReadyAgent(admin, PROMPT);

    const prompt = admin.getByTestId('chatgpt-connect-prompt');
    await expect(
      prompt,
      'the session page shows the connect prompt',
    ).toBeVisible({ timeout: 60_000 });
    await expect(prompt).toContainText(REASON);
    await expect(prompt).toContainText(
      'Your message is sent as soon as you have connected it.',
    );
    await expect(
      admin.getByRole('textbox', { name: 'Message' }),
    ).toBeDisabled();
    await test.info().attach('the connect prompt', {
      body: await admin.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    // The page polls; a held message must stay held across reads.
    await admin.waitForTimeout(5_000);
    expect(
      turns,
      'no turn is sent while the person is not connected',
    ).toHaveLength(0);

    await prompt.getByRole('button', { name: 'Connect' }).click();
    const dialog = admin.getByRole('dialog', {
      name: 'Sign in to your connections',
    });
    await expect(
      dialog.getByRole('list', { name: 'Connections' }),
    ).toContainText('ChatGPT');

    // The person signs in on OpenAI's tab and comes back to the portal's:
    // that return is the read that finds them connected.
    connected = true;
    await admin.evaluate(() => {
      window.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await expect(
      dialog.getByText('✓ Connected'),
      'the dialog reads Connected without a reload, after the prompt has gone',
    ).toBeVisible({ timeout: 30_000 });
    await expect(prompt).toHaveCount(0);
    await expect
      .poll(() => turns.length, {
        message: 'the held first message is sent once the person is connected',
        timeout: 30_000,
      })
      .toBe(1);
    expect(turns[0].postData() ?? '').toContain(PROMPT);
    await dialog.getByRole('button', { name: /^(Done|Close)$/ }).click();
  } catch (error) {
    failure = error;
  } finally {
    admin.off('request', onRequest);
    await admin.unroute('**/api/muster/auth/status**', status);
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
