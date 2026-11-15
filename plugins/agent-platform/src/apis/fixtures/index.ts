/**
 * The agent-platform plugin's fixture data for other fixture modules
 * (docs/fixtures.md). A subpath of its own
 * (`@giantswarm/backstage-plugin-agent-platform/fixtures`) so nothing reaches
 * a production build through the package's main entry; only fixture modules
 * and tests import it.
 */
import type { KubeObjectInterface } from '@giantswarm/backstage-plugin-kubernetes-react';

import { agentManagerFixtureState } from './agentManagerFixtureState';

/**
 * The agent-platform objects of an installation, as its Kubernetes API lists
 * them: each organization namespace's Harness and models, each agent's Agent
 * and carrier `RemoteMCPServer`, with what agent-manager's fixture wrote
 * since the page loaded. The same array while nothing changed.
 */
export function agentPlatformKubernetesObjectsOf(
  installation: string,
): KubeObjectInterface[] {
  return agentManagerFixtureState().kubernetesObjectsOf(installation);
}
