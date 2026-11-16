import { expect, open, test } from './fixtures';
import { lab } from './lab';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';

/**
 * Deleting an organization from its page (giantswarm/backstage#3364), in
 * apply mode: the dialog lists what agent-manager's erase preview says the
 * delete erases and keeps, refuses to erase until the person types
 * `<parent>/<name>`, and then deletes it as the person through
 * `delete_organization`. agent-platform-operator erases it: the organization
 * namespace, and with it its `organization-*` RoleBindings, are gone. It
 * deletes the namespace only after its erase delay (`--snapshot-erase-delay`,
 * 5 minutes by default), which the spec reads from the operator's Deployment
 * and waits past.
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

/**
 * What the spec waits past the operator's erase delay for the erasure to end:
 * the operator deletes the namespace once the delay has passed, at its next
 * poll, and the namespace's own deletion takes seconds more.
 */
const ERASE_MARGIN = 3 * 60_000;

/** The wait for the erasure when the operator's erase delay is unknown. */
const ERASE_WAIT_UNKNOWN = 8 * 60_000;

const GO_DURATION_UNITS: Record<string, number> = {
  ns: 1e-6,
  us: 1e-3,
  µs: 1e-3,
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
};

/** A Go duration (`5m`, `5m0s`, `1h30m`, `90s`) in milliseconds. */
function goDuration(value: string): number | undefined {
  if (!/^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/.test(value)) {
    return undefined;
  }
  let total = 0;
  for (const [, amount, , unit] of value.matchAll(
    /(\d+(\.\d+)?)(ns|us|µs|ms|s|m|h)/g,
  )) {
    total += Number(amount) * GO_DURATION_UNITS[unit];
  }
  return total;
}

/**
 * agent-platform-operator's `--snapshot-erase-delay` from its Deployment's
 * args, in milliseconds: how long after an organization is deleted the
 * operator deletes its namespace. Undefined when the spec cannot read it.
 */
async function eraseDelay(): Promise<number | undefined> {
  const { stdout } = await kubectl([
    'get',
    'deployments',
    '--all-namespaces',
    '-l',
    'app.kubernetes.io/name=agent-platform-operator',
    '-o',
    'json',
  ]).catch(() => ({ stdout: '' }));
  let list: {
    items?: {
      spec?: { template?: { spec?: { containers?: { args?: string[] }[] } } };
    }[];
  };
  try {
    list = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  const args = (list.items ?? []).flatMap(item =>
    (item.spec?.template?.spec?.containers ?? []).flatMap(c => c.args ?? []),
  );
  const flag = '--snapshot-erase-delay';
  for (const [i, arg] of args.entries()) {
    if (arg.startsWith(`${flag}=`)) {
      return goDuration(arg.slice(flag.length + 1));
    }
    if (arg === flag) {
      return goDuration(args[i + 1] ?? '');
    }
  }
  return undefined;
}

/**
 * Whether the delete reached the cluster: the `AgentPlatformOrganization` is
 * marked for deletion (the operator's finalizer holds it through the erase
 * delay), or gone already.
 */
async function markedForDeletion(): Promise<boolean> {
  const { stdout } = await kubectl([
    'get',
    'agentplatformorganization',
    '-n',
    PARENT,
    NAME,
    '--ignore-not-found',
    '-o',
    'jsonpath={.metadata.name} {.metadata.deletionTimestamp}',
  ]);
  const [name, deletionTimestamp] = stdout.trim().split(' ');
  return !name || Boolean(deletionTimestamp);
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
  const delay = await eraseDelay();
  const eraseWait =
    delay === undefined ? ERASE_WAIT_UNKNOWN : delay + ERASE_MARGIN;
  // The organization's creation (3 minutes at most) and the dialog (about 3
  // more), then the erasure.
  test.setTimeout(6 * 60_000 + eraseWait);

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
    // A delete that did not start fails here, not after the erase wait.
    await expect
      .poll(markedForDeletion, {
        message: `${PARENT}/${NAME} is not marked for deletion`,
        timeout: 30_000,
      })
      .toBe(true);
    // The operator deletes the namespace only after its erase delay
    // (`--snapshot-erase-delay`, 5 minutes by default).
    await expect
      .poll(() => exists(['namespace', namespace]), { timeout: eraseWait })
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
