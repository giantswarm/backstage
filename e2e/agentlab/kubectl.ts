import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lab } from './lab';

const run = promisify(execFile);

/**
 * The lab's admin kubeconfig, its `state/kubeconfig` (agentlab merges nothing
 * into `~/.kube/config`). The suite reaches the platform through the portal;
 * the few specs that set up what the portal has no flow for apply it with
 * {@link kubectl}, and skip without this ({@link NEEDS_KUBECONFIG}).
 */
export const KUBECONFIG = process.env.AGENTLAB_KUBECONFIG;

/** Why a spec that needs {@link kubectl} skipped. */
export const NEEDS_KUBECONFIG =
  "needs kubectl access to the lab; set AGENTLAB_KUBECONFIG to the lab's state/kubeconfig";

/** Where the lab's platform runs: muster and its MCPServers, Flux's objects. */
export const PLATFORM_NAMESPACE = 'agent-platform';

/** `kubectl` against the lab, with `input` on stdin (for `apply -f -`). */
export async function kubectl(args: string[], input?: string) {
  const child = run('kubectl', ['--kubeconfig', KUBECONFIG!, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (input !== undefined) {
    child.child.stdin?.end(input);
  }
  return child;
}

/**
 * The namespace of the lab's organization ({@link lab.organization}), its
 * `AgentPlatformOrganization`'s `status.namespace`; undefined on a lab without
 * organizations, where the wizard offers Platform and reads `kagent`.
 */
export async function labOrganizationNamespace(): Promise<string | undefined> {
  const { stdout } = await kubectl([
    'get',
    'agentplatformorganizations.agent-platform.giantswarm.io',
    '-n',
    lab.organization.parent,
    lab.organization.name,
    '--ignore-not-found',
    '-o',
    'jsonpath={.status.namespace}',
  ]).catch(() => ({ stdout: '' }));
  return stdout.trim() || undefined;
}
