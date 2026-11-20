import type { KubeObjectInterface } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  type FixtureRbacBinding,
  inInstallation,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

const RBAC = 'rbac.authorization.k8s.io';

/** A binding as the fixture management cluster's RBAC API answers it. */
function objectOf(binding: FixtureRbacBinding): KubeObjectInterface {
  const { installation, kind, name, namespace } = binding;
  return {
    apiVersion: `${RBAC}/v1`,
    kind,
    metadata: {
      name,
      ...(namespace && { namespace }),
      uid: `${installation}-fixture-rbac-${kind}-${namespace ?? ''}-${name}`,
      creationTimestamp: binding.createdAt,
    },
    roleRef: { apiGroup: RBAC, ...binding.role },
    subjects: binding.subjects.map(subject =>
      subject.kind === 'ServiceAccount'
        ? subject
        : { apiGroup: RBAC, ...subject },
    ),
  } as KubeObjectInterface;
}

/**
 * The RoleBindings and ClusterRoleBindings of an installation's management
 * cluster in fixture mode, from the data set's `rbacBindings`.
 */
export function rbacObjectsOf(
  bindings: readonly FixtureRbacBinding[],
  installation: string,
): KubeObjectInterface[] {
  return inInstallation(bindings, installation).map(objectOf);
}
