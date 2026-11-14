/**
 * The muster plugin's fixture data for other fixture modules
 * (docs/fixtures.md). A subpath of its own
 * (`@giantswarm/backstage-plugin-muster/fixtures`) so nothing reaches a
 * production build through the package's main entry; only fixture modules
 * and tests import it.
 */
import {
  baseDataSet,
  inInstallation,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import type { KubeObjectInterface } from '@giantswarm/backstage-plugin-kubernetes-react';

import { mcpServerObjectOf, musterWorkflowObjectOf } from './musterFixtureData';

/**
 * muster's objects in an installation of the base data set, as its
 * Kubernetes API lists them: an `MCPServer` per connector and a `Workflow`
 * per workflow.
 */
export function musterKubernetesObjectsOf(
  installation: string,
): KubeObjectInterface[] {
  const data = baseDataSet();
  return [
    ...inInstallation(data.connectors, installation).map(mcpServerObjectOf),
    ...inInstallation(data.workflows, installation).map(workflow =>
      musterWorkflowObjectOf(workflow, data.connectors),
    ),
  ];
}
