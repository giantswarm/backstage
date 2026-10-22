import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  expectAgentRendered,
  test,
} from './fixtures';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';

/**
 * The namespace's EgressPolicies in the agent wizard: a tenant admin's policy
 * (applied here with kubectl, the portal has no flow for it) is listed under
 * More options with its origins and the header its credential is sent in,
 * picked by name, shown on the review and on the agent's Configuration card,
 * and the Agent agent-manager creates carries it in `spec.egressPolicyRefs`.
 * An unpicked policy is listed but not carried.
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
          await group
            .getByRole('checkbox', { name: new RegExp(PICKED) })
            .check();
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

    const { stdout } = await kubectl([
      '-n',
      NAMESPACE,
      'get',
      'agents.api.kagent.dev',
      agentSlug,
      '-o',
      'jsonpath={.spec.egressPolicyRefs}',
    ]);
    expect(JSON.parse(stdout), "the Agent's spec.egressPolicyRefs").toEqual([
      { name: PICKED },
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
  if (failure !== undefined) {
    throw failure;
  }
});
