import { expect, open, test } from './fixtures';
import { lab } from './lab';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';

/**
 * Creating an organization on the Organizations page, then deleting it from
 * its page (giantswarm/backstage#3364), in apply mode. The create writes one
 * `Organization` with the Agent Platform on (`create_organization`), and its
 * page shows it at once. The delete dialog lists what agent-manager's erase
 * preview says the delete erases and keeps, refuses to erase until the
 * person types the organization's name, and then deletes it as the person
 * through `delete_organization`. agent-platform-operator erases it: the organization
 * namespace, and with it its `organization-*` RoleBindings, are gone. With a
 * snapshot bucket, it deletes the namespace only after its erase delay
 * (`--snapshot-erase-delay`, 5 minutes by default), which the spec reads from
 * the operator's Deployment and waits past.
 *
 * Needs the lab's organizations on the `Organization` kind
 * (agent-platform-operator, agent-manager with `create_organization` on
 * `Organization`), and the admin as a cluster-admin, which holds what
 * agent-platform:organizations-admin grants. The spec creates its own
 * organization.
 */

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const NAME = `e2e-delete-${stamp}`;
const BASE = `/organizations/${lab.installation}/${NAME}`;
/** The spec's `Organization` (cluster-scoped), as kubectl names it. */
const ORGANIZATION = `organizations.security.giantswarm.io/${NAME}`;

/** A field of the spec's `Organization`, by JSONPath; empty when absent. */
async function organizationField(path: string): Promise<string> {
  const { stdout } = await kubectl([
    'get',
    ORGANIZATION,
    '-o',
    `jsonpath={${path}}`,
    '--ignore-not-found',
  ]);
  return stdout.trim();
}

function organizationNamespace(): Promise<string> {
  return organizationField('.status.agentPlatform.namespace');
}

/**
 * What the spec waits past the operator's erase delay for the erasure to end.
 * The delay starts when the operator first empties the organization's snapshot
 * prefix, after its Workloads and Sessions steps; the margin holds those steps
 * and the namespace's own termination after the delay.
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
 * args, in milliseconds: how long after it first empties a deleted
 * organization's snapshot prefix the operator empties it again, and only then
 * deletes the namespace. Undefined when the spec cannot read it.
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
 * Whether the delete reached the cluster: the `Organization` is marked for
 * deletion (the operator's finalizer holds it through the erase delay), or
 * gone already.
 */
async function markedForDeletion(): Promise<boolean> {
  const { stdout } = await kubectl([
    'get',
    ORGANIZATION,
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

test('organization create and delete: the create writes one Organization, the dialog lists the erasure, refuses a wrong name and erases it', async ({
  admin,
}) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  const delay = await eraseDelay();
  const eraseWait =
    delay === undefined ? ERASE_WAIT_UNKNOWN : delay + ERASE_MARGIN;
  // The organization's creation in the portal and its namespace (3 minutes
  // at most), the dialog (about 3 more), then the erasure and the finalizer's
  // removal (1 minute at most).
  test.setTimeout(7 * 60_000 + eraseWait);

  try {
    await open(admin, '/organizations');
    await admin.getByRole('button', { name: 'Create organization' }).click();
    const create = admin.getByRole('dialog');
    await create.getByRole('textbox', { name: 'Name' }).fill(NAME);
    await create.getByRole('button', { name: 'Create organization' }).click();
    // The page opens at once, before the operator reports it ready.
    await expect(admin).toHaveURL(new RegExp(`${BASE}$`), { timeout: 60_000 });
    expect(await organizationField('.spec.agentPlatform.enabled')).toBe('true');
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
    const field = dialog.getByLabel(`Type ${NAME} to confirm`);
    await expect(confirm).toBeDisabled();
    await field.fill(`${NAME}-other`);
    await expect(confirm).toBeDisabled();
    await field.fill(NAME);
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(dialog).toBeHidden({ timeout: 60_000 });
    // A delete that did not start fails here, not after the erase wait.
    await expect
      .poll(markedForDeletion, {
        message: `${NAME} is not marked for deletion`,
        timeout: 30_000,
      })
      .toBe(true);
    // The operator deletes the namespace only after its erase delay
    // (`--snapshot-erase-delay`, 5 minutes by default).
    await expect
      .poll(() => exists(['namespace', namespace]), { timeout: eraseWait })
      .toBe(false);
    // The operator removes its finalizer after the namespace is gone.
    await expect
      .poll(() => exists([ORGANIZATION]), {
        timeout: 60_000,
      })
      .toBe(false);
    expect(
      await exists(['rolebindings', '-n', namespace, 'organization-admins']),
    ).toBe(false);
  } finally {
    // The chart's delete guard admits the deletion of an organization with
    // the Agent Platform only with the delete intent.
    await kubectl([
      'annotate',
      ORGANIZATION,
      'kustomize.toolkit.fluxcd.io/prune=enabled',
      '--overwrite',
    ]).catch(() => undefined);
    await kubectl([
      'delete',
      ORGANIZATION,
      '--ignore-not-found',
      '--wait=false',
    ]).catch(() => undefined);
  }
});
