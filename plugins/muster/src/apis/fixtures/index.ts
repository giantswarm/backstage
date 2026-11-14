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

const objectsByInstallation = new Map<string, KubeObjectInterface[]>();

/**
 * muster's objects in an installation of the base data set, as its
 * Kubernetes API lists them: an `MCPServer` per connector and a `Workflow`
 * per workflow. Worked out once per installation: they never change.
 */
export function musterKubernetesObjectsOf(
  installation: string,
): KubeObjectInterface[] {
  let objects = objectsByInstallation.get(installation);
  if (!objects) {
    const data = baseDataSet();
    objects = [
      ...inInstallation(data.connectors, installation).map(mcpServerObjectOf),
      ...inInstallation(data.workflows, installation).map(workflow =>
        musterWorkflowObjectOf(workflow, data.connectors),
      ),
    ];
    objectsByInstallation.set(installation, objects);
  }
  return objects;
}
