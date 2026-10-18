import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  test,
} from './fixtures';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';

/**
 * The wizard's plugin picker: a plugin of the configured skill repositories,
 * picked on the skills step, is reviewed with its pin, passes agent-manager's
 * dry run and is written into the agent's release pinned to the commit its
 * card showed.
 *
 * Needs a skill repository holding a Claude Code plugin among the lab's
 * `agentPlatform.skills.repositories` (`AGENTLAB_PLUGIN`, default
 * `commit-commands` of anthropics/claude-code) and the lab's `claude` Harness,
 * the runtime that loads such a plugin whole. Skips on a lab without either.
 */

test.describe.configure({ mode: 'serial' });

const PLUGIN = process.env.AGENTLAB_PLUGIN ?? 'commit-commands';

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const agentName = `E2E Plugins ${stamp}`;
const agentSlug = `e2e-plugins-${stamp}`;

test('a plugin picked on the skills step is reviewed and written pinned', async ({
  admin,
}) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  test.setTimeout(10 * 60_000);

  let pin = '';
  let detailPath: string | undefined;
  try {
    detailPath = await createAgentInWizard(admin, agentName, agentSlug, {
      harness: /Harness claude\b/,
      onStep: async step => {
        if (step === 'Skills') {
          const card = admin.getByRole('checkbox', {
            name: `Plugin ${PLUGIN}`,
          });
          await expect(
            admin.getByRole('heading', { name: 'Select skills and plugins' }),
          ).toBeVisible({ timeout: 60_000 });
          test.skip(
            (await card.count()) === 0,
            `the lab's skill repositories hold no plugin ${PLUGIN} (AGENTLAB_PLUGIN)`,
          );
          await expect(card).toHaveText(/loads whole/);
          pin =
            (await card
              .locator('[aria-label^="Pinned to commit"]')
              .getAttribute('aria-label')) ?? '';
          await card.click();
          await expect(card).toHaveAttribute('aria-checked', 'true');
        }
        if (step === 'Review') {
          await expect(
            admin.getByText(PLUGIN, { exact: true }).first(),
            'the summary lists the plugin',
          ).toBeVisible();
          await expect(
            admin.getByText('Plugin pins'),
            'the technical details list the plugin pin',
          ).toBeVisible();
        }
      },
    });

    // The release carries the plugin, pinned to the commit its card showed.
    const short = pin.match(/commit ([0-9a-f]{7})/)?.[1] ?? '';
    expect(short, 'the card named the commit it pins').not.toBe('');
    const { stdout } = await kubectl([
      '-n',
      'kagent',
      'get',
      'helmrelease',
      agentSlug,
      '-o',
      'jsonpath={.spec.values.plugins}',
    ]);
    const plugins = JSON.parse(stdout) as Array<{
      path?: string;
      git?: { commit?: string };
      skills?: string[];
    }>;
    expect(plugins).toHaveLength(1);
    expect(plugins[0].path).toMatch(new RegExp(`(^|/)${PLUGIN}$`));
    expect(plugins[0].git?.commit).toMatch(
      new RegExp(`^${short}[0-9a-f]{33}$`),
    );
    expect(plugins[0].skills).toBeUndefined();
  } finally {
    if (detailPath) {
      await deleteAgentInPortal(admin, detailPath, agentSlug);
    }
  }
});
