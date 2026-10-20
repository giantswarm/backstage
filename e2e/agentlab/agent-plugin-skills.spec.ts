import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  startSessionOnReadyAgent,
  test,
} from './fixtures';

/**
 * A plugin with selected skills loads on a coding agent: on the wizard's
 * skills step the Agent Plugins package `fixtures/plugins/selection` of
 * giantswarm/agentlab lists its two skills as checkboxes, the agent is created
 * on the lab's Claude Code Harness with only `selected-codeword` enabled, and
 * its turn knows that skill's codeword and not its sibling's — the package
 * materialises only what the agent selects.
 *
 * Needs the lab's `claude` Harness, a working Anthropic key behind
 * `default-model-config`, and https://github.com/giantswarm/agentlab among the
 * portal's and agent-manager's skill repositories (a `platform.valuesFiles`
 * overlay). Skips on a lab whose skills step does not offer the package.
 */

test.describe.configure({ mode: 'serial' });

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const agentName = `E2E Plugin Skills ${stamp}`;
const agentSlug = `e2e-plugin-skills-${stamp}`;
const PLUGIN = 'selection';
const prompt =
  'What is the codeword of the plugin selection fixture, and what is the codeword of the plugin exclusion fixture? Answer each from your skills, or with UNKNOWN when no skill of yours tells you.';

test('a coding agent loads only the plugin skills selected in the wizard', async ({
  admin,
}) => {
  test.setTimeout(15 * 60_000);

  const detailPath = await createAgentInWizard(admin, agentName, agentSlug, {
    harness: /Harness claude\b/,
    onStep: async step => {
      if (step === 'Skills') {
        const skills = admin.getByRole('group', {
          name: `Skills of plugin ${PLUGIN}`,
        });
        await skills.waitFor({ timeout: 60_000 }).catch(() => undefined);
        test.skip(
          !(await skills.isVisible()),
          `the skills step offers no plugin ${PLUGIN}: add https://github.com/giantswarm/agentlab to the lab's skill repositories`,
        );
        await expect(
          skills.getByRole('checkbox', { name: /unselected-codeword/ }),
        ).toBeVisible();
        await skills
          .getByRole('checkbox', { name: /^selected-codeword/ })
          .check();
      }
      if (step === 'Review') {
        await expect(
          admin.getByText(`${PLUGIN} (selected-codeword)`),
          'the review names the plugin with only its selected skill',
        ).toBeVisible();
      }
    },
  });

  let failure: unknown;
  try {
    await startSessionOnReadyAgent(admin, prompt);
    const answer = admin.getByTestId('timeline-agent-message').last();
    await expect(
      answer,
      "the selected skill's codeword arrives on the timeline",
    ).toContainText('saffron-viaduct', { timeout: 5 * 60_000 });
    await expect(
      admin.getByRole('button', { name: 'Send' }),
      'the composer offers Send again once the turn is over',
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      answer,
      'the skill left out of the selection was not loaded',
    ).not.toContainText('pewter-orchard');
    await test.info().attach('the answer of the agent with a plugin skill', {
      body: await answer.screenshot(),
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
