import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  expectAgentRendered,
  open,
  test,
} from './fixtures';

/**
 * The Toolset card on an agent's Tools tab says how muster holds the agent to
 * its toolset, in agent-manager's words (`get_info`'s `toolsetBound`): where
 * the lab trusts the actor JWT (workspaces and Agent Substrate on, the chart
 * telling agent-manager so), the toolset is bound to each session at its
 * start; elsewhere it is declared, with the header caveat. The agent is the
 * wizard's, with the read-only preset, and the run deletes it again.
 */

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const agentName = `E2E Toolset Bound ${stamp}`;
const agentSlug = `e2e-toolset-bound-${stamp}`;

const BOUND =
  'Bound to each session at its start. A change applies to new sessions.';
const DECLARED =
  'Declared: the agent sends it as the X-Muster-Toolset header, and a process in its sandbox that omits the header is not held to it.';

test('agent toolset: the Toolset card says bound or declared, as agent-manager reports it', async ({
  admin,
}) => {
  test.setTimeout(10 * 60_000);

  const detailPath = await createAgentInWizard(admin, agentName, agentSlug, {
    onStep: async step => {
      if (step === 'Tools') {
        await admin
          .getByRole('radiogroup', { name: 'What it may do' })
          .getByRole('radio', { name: /^Read-only tools/ })
          .click();
      }
    },
  });

  let failure: unknown;
  try {
    await expectAgentRendered(admin);
    await open(admin, `${detailPath}/tools`);
    const card = admin
      .getByRole('heading', { name: 'Toolset' })
      .locator('xpath=ancestor::*[.//*[@role="list"]][1]');
    await expect(
      card.getByRole('list', { name: 'Declared toolset' }),
    ).toContainText('Read-only tools');
    await expect(
      card.getByText(BOUND).or(card.getByText(DECLARED)),
      'the card says how muster holds the agent to its toolset',
    ).toBeVisible({ timeout: 60_000 });
    // One wording, never both: bound where the lab trusts the actor JWT (a
    // chart from 4.162.0 with workspaces and Substrate on), declared elsewhere.
    const isBound = await card.getByText(BOUND).isVisible();
    await expect(card.getByText(isBound ? DECLARED : BOUND)).toBeHidden();
    test.info().annotations.push({
      type: 'toolset',
      description: isBound ? 'bound to each session' : 'declared',
    });
    await expect(
      card.getByText(
        'Composition, not authorization: never more than your own access.',
      ),
    ).toBeVisible();
  } catch (error) {
    failure = error;
  }
  await deleteAgentInPortal(admin, detailPath, agentSlug);
  if (failure) {
    throw failure;
  }
});
