import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  expectAgentRendered,
  expectWizardStep,
  open,
  openWizardMoreOptions,
  test,
} from './fixtures';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';

/**
 * The namespace's EgressPolicies in the agent wizard: a tenant admin's policy
 * (applied here with kubectl, the portal has no flow for it) is listed under
 * More options with its origins and the header its credential is sent in,
 * picked by name, shown on the review and on the agent's Configuration card,
 * and the Agent agent-manager creates carries it in `spec.egressPolicyRefs`.
 * An unpicked policy is listed but not carried until the Edit wizard picks it
 * too: the review names the change, and the Agent then carries both.
 */

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const agentName = `E2E Egress Policy ${stamp}`;
const agentSlug = `e2e-egress-policy-${stamp}`;
const PICKED = `e2e-picked-${stamp}`;
const UNPICKED = `e2e-unpicked-${stamp}`;
/** Where the lab admin's wizard creates an agent: the platform tenant. */
const NAMESPACE = 'kagent';

function egressPolicy(name: string, origin: string, header?: string): string {
  const authentication = header
    ? `
      authentication:
        header: ${header}
        secretKeyRef: {name: ${name}-credential, key: token}`
    : '';
  return `apiVersion: api.kagent.dev/v1alpha3
kind: EgressPolicy
metadata:
  name: ${name}
  namespace: ${NAMESPACE}
spec:
  destinations:
    - origin: ${origin}${authentication}
`;
}

test('agent egress: an EgressPolicy picked in the wizard lands in spec.egressPolicyRefs', async ({
  admin,
}, testInfo) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  test.setTimeout(10 * 60_000);

  await kubectl(
    ['apply', '-f', '-'],
    `${egressPolicy(PICKED, 'https://example.com')}---\n${egressPolicy(
      UNPICKED,
      'https://www.iana.org',
      'X-Api-Key',
    )}`,
  );

  let detailPath: string | undefined;
  let failure: unknown;
  try {
    detailPath = await createAgentInWizard(admin, agentName, agentSlug, {
      onStep: async step => {
        if (step === 'Details') {
          const group = admin.getByRole('group', { name: /^EgressPolicies/ });
          await expect(group.getByText('https://example.com')).toBeVisible({
            timeout: 60_000,
          });
          await expect(
            group.getByText('https://www.iana.org (adds X-Api-Key)'),
            'the credential header is named, never the Secret',
          ).toBeVisible();
          await expect(group.getByText(`${UNPICKED}-credential`)).toBeHidden();
          // The react-aria input is visually hidden: a person clicks its
          // label.
          const picked = group.getByRole('checkbox', {
            name: new RegExp(PICKED),
          });
          await picked.locator('xpath=ancestor::label[1]').click();
          await expect(picked).toBeChecked();
          await testInfo.attach('egress-policy-picker', {
            body: await group.screenshot(),
            contentType: 'image/png',
          });
        }
        if (step === 'Review') {
          await expect(admin.getByText(PICKED).first()).toBeVisible();
          await expect(admin.getByText(UNPICKED)).toBeHidden();
        }
      },
    });

    await expectAgentRendered(admin);
    const foldOut = admin.getByRole('button', { name: 'Technical details' });
    if ((await foldOut.getAttribute('aria-expanded')) !== 'true') {
      await foldOut.click();
    }
    const card = admin
      .getByRole('heading', { name: 'Configuration', exact: true })
      .locator('xpath=ancestor::*[.//dt][1]');
    await expect(card.getByText(PICKED, { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(card.getByText('https://example.com')).toBeVisible();
    await testInfo.attach('configuration-card', {
      body: await card.screenshot(),
      contentType: 'image/png',
    });

    const refs = async () => {
      const { stdout } = await kubectl([
        '-n',
        NAMESPACE,
        'get',
        'agents.api.kagent.dev',
        agentSlug,
        '-o',
        'jsonpath={.spec.egressPolicyRefs}',
      ]);
      return stdout ? JSON.parse(stdout) : [];
    };
    expect(await refs(), "the Agent's spec.egressPolicyRefs").toEqual([
      { name: PICKED },
    ]);

    // Edit: the pick is pre-filled, the second policy is added, the review
    // names the change and the Agent carries both.
    await open(admin, `${detailPath}/edit`);
    await expectWizardStep(admin, 'Details');
    await openWizardMoreOptions(admin);
    const group = admin.getByRole('group', { name: /^EgressPolicies/ });
    const picked = group.getByRole('checkbox', { name: new RegExp(PICKED) });
    const unpicked = group.getByRole('checkbox', {
      name: new RegExp(UNPICKED),
    });
    await expect(picked, 'the edit starts from get_agent').toBeChecked({
      timeout: 60_000,
    });
    await unpicked.locator('xpath=ancestor::label[1]').click();
    await expect(unpicked).toBeChecked();
    for (const step of ['Details', 'Skills', 'Tools']) {
      await expectWizardStep(admin, step);
      await admin.getByRole('button', { name: 'Continue' }).first().click();
    }
    await expectWizardStep(admin, 'Review');
    await expect(
      admin
        .getByRole('list', { name: 'Changed fields' })
        .getByText('EgressPolicies'),
    ).toBeVisible();
    const save = admin.getByRole('button', { name: /^Save changes$/ }).last();
    await expect(save).toBeEnabled({ timeout: 60_000 });
    await save.click();
    await expect
      .poll(refs, {
        message: "the edited Agent's spec.egressPolicyRefs",
        timeout: 180_000,
      })
      .toEqual([{ name: PICKED }, { name: UNPICKED }]);

    // The second policy names a credential Secret nobody wrote: the agent's
    // page shows the Agent's status error, then the Secret makes it Ready.
    await open(admin, detailPath);
    await expect(
      admin
        .getByText(`Secret "${UNPICKED}-credential" not found`, {
          exact: false,
        })
        .first(),
      "the agent's page shows the picked policy's resolution error",
    ).toBeVisible({ timeout: 180_000 });
    await testInfo.attach('policy-status-error', {
      body: await admin.screenshot(),
      contentType: 'image/png',
    });
    await kubectl([
      '-n',
      NAMESPACE,
      'create',
      'secret',
      'generic',
      `${UNPICKED}-credential`,
      '--from-literal=token=e2e-fixture',
    ]);
    await kubectl([
      '-n',
      NAMESPACE,
      'wait',
      'agents.api.kagent.dev',
      agentSlug,
      '--for=condition=Ready',
      '--timeout=300s',
    ]);
  } catch (error) {
    failure = error;
  }
  if (detailPath) {
    await deleteAgentInPortal(admin, detailPath, agentSlug);
  }
  await kubectl([
    '-n',
    NAMESPACE,
    'delete',
    'egresspolicies.api.kagent.dev',
    PICKED,
    UNPICKED,
    '--ignore-not-found',
  ]);
  await kubectl([
    '-n',
    NAMESPACE,
    'delete',
    'secret',
    `${UNPICKED}-credential`,
    '--ignore-not-found',
  ]);
  if (failure !== undefined) {
    throw failure;
  }
});
