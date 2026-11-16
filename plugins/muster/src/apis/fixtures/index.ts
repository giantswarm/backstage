/**
 * The muster plugin's fixture data for other fixture modules
 * (docs/fixtures.md). A subpath of its own
 * (`@giantswarm/backstage-plugin-muster/fixtures`) so nothing reaches a
 * production build through the package's main entry; only fixture modules
 * and tests import it.
 */
import type { KubeObjectInterface } from '@giantswarm/backstage-plugin-kubernetes-react';

import { musterConnectorFixtureState } from './musterConnectorFixtureState';

/**
 * muster's objects in an installation of the page's data set, as its
 * Kubernetes API lists them: an `MCPServer` per connector, as the connector
 * writes leave them, and a `Workflow` per workflow. The same array while
 * nothing changed, a new one after a write.
 */
export function musterKubernetesObjectsOf(
  installation: string,
): KubeObjectInterface[] {
  return musterConnectorFixtureState().kubernetesObjectsOf(installation);
}
