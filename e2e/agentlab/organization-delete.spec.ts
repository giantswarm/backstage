import { expect, open, test } from './fixtures';
import { lab } from './lab';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';

/**
 * Deleting an organization from its page (giantswarm/backstage#3364), in
 * apply mode: the dialog lists what agent-manager's erase preview says the
 * delete erases and keeps, refuses to erase until the person types
 * `<parent>/<name>`, and then deletes it as the person through
 * `delete_organization`. agent-platform-operator erases it: the organization
 * namespace, and with it its `organization-*` RoleBindings, are gone.
 *
 * Needs the lab's organizations (agent-platform-operator, agent-manager
 * 2.24 or later for `list_organizations`), the admin as a cluster-admin, which
 * holds what agent-platform:organizations-admin grants, and the parent
 * namespace `AGENTLAB_ORGANIZATIONS_PARENT` (default
 * `agentlab-organizations`). The spec creates its own organization.
 */

const PARENT =
  process.env.AGENTLAB_ORGANIZATIONS_PARENT ?? 'agentlab-organizations';
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const NAME = `e2e-delete-${stamp}`;
const BASE = `/organizations/${lab.installation}/${PARENT}/${NAME}`;

const MANIFEST = `apiVersion: agent-platform.giantswarm.io/v1alpha1
kind: AgentPlatformOrganization
metadata:
  name: ${NAME}
  namespace: ${PARENT}
  labels:
    app.kubernetes.io/managed-by: agentlab
spec:
  harnesses: [kagent]
  workers:
    replicas: 1
`;

async function organizationNamespace(): Promise<string> {
  const { stdout } = await kubectl([
    'get',
    'agentplatformorganization',
    '-n',
    PARENT,
    NAME,
    '-o',
    'jsonpath={.status.namespace}',
    '--ignore-not-found',
  ]);
  return stdout.trim();
}

async function exists(args: string[]): Promise<boolean> {
  const { stdout } = await kubectl([
    'get',
    ...args,
    '--ignore-not-found',
    '-o',
    'name',
  ]);
  return stdout.trim() !== '';
}

test('organization delete: the dialog lists the erasure, refuses a wrong name and erases the organization', async ({
  admin,
}) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  test.setTimeout(10 * 60_000);

  try {
    await kubectl(['apply', '-f', '-'], MANIFEST);
    await expect
      .poll(organizationNamespace, { timeout: 3 * 60_000 })
      .not.toBe('');
    const namespace = await organizationNamespace();

    await open(admin, BASE);
    await admin.getByRole('button', { name: 'Delete organization' }).click();
    const dialog = admin.getByRole('dialog');
    await expect(dialog.getByText('This erases')).toBeVisible({
      timeout: 60_000,
    });
    await expect(dialog.getByText(/^Kept: /)).toBeVisible();
    await expect(dialog.getByText(/^Running sessions: /)).toBeVisible();

    const confirm = dialog.getByRole('button', { name: 'Delete organization' });
    const field = dialog.getByLabel(`Type ${PARENT}/${NAME} to confirm`);
    await expect(confirm).toBeDisabled();
    await field.fill(NAME);
    await expect(confirm).toBeDisabled();
    await field.fill(`${PARENT}/${NAME}`);
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(dialog).toBeHidden({ timeout: 60_000 });
    await expect
      .poll(() => exists(['namespace', namespace]), { timeout: 5 * 60_000 })
      .toBe(false);
    expect(
      await exists(['agentplatformorganization', '-n', PARENT, NAME]),
    ).toBe(false);
    expect(
      await exists(['rolebindings', '-n', namespace, 'organization-admins']),
    ).toBe(false);
  } finally {
    await kubectl([
      'delete',
      'agentplatformorganization',
      '-n',
      PARENT,
      NAME,
      '--ignore-not-found',
      '--wait=false',
    ]).catch(() => undefined);
  }
});
