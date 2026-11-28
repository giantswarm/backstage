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
 * An `Organization`'s Agent Platform namespace, as a kubectl JSONPath without
 * its braces: the `name` of the `status.namespaces` entry whose `capability`
 * is `agentPlatform`, which agent-platform-operator writes. Empty until the
 * operator reports it.
 */
export const AGENT_PLATFORM_NAMESPACE_PATH =
  '.status.namespaces[?(@.capability=="agentPlatform")].name';

/**
 * The namespace of the lab's organization ({@link lab.organization}), its
 * `Organization`'s {@link AGENT_PLATFORM_NAMESPACE_PATH}; undefined on a lab
 * without organizations, where the wizard offers Platform and reads `kagent`.
 */
export async function labOrganizationNamespace(): Promise<string | undefined> {
  const { stdout } = await kubectl([
    'get',
    'organizations.security.giantswarm.io',
    lab.organization.name,
    '--ignore-not-found',
    '-o',
    `jsonpath={${AGENT_PLATFORM_NAMESPACE_PATH}}`,
  ]).catch(() => ({ stdout: '' }));
  return stdout.trim() || undefined;
}
