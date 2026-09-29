import { ControlPlane } from '@giantswarm/backstage-plugin-kubernetes-react';

export type ControlPlaneRef = {
  apiVersion?: string;
  apiGroup?: string;
  kind: string;
  name: string;
  namespace: string;
};

/**
 * Whether a cluster's `spec.controlPlaneRef` points at a resource the
 * `ControlPlane` model can fetch, i.e. a `KubeadmControlPlane` in
 * `controlplane.cluster.x-k8s.io`.
 *
 * Managed control planes are a different kind, and sometimes a different API
 * group — an AKS cluster references an `AzureASOManagedControlPlane` in
 * `infrastructure.cluster.x-k8s.io`, an EKS cluster an
 * `AWSManagedControlPlane` — and requesting those by name from the
 * `kubeadmcontrolplanes` endpoint can only ever yield a 404.
 *
 * v1beta2 refs carry `apiGroup`, v1beta1 refs carry `apiVersion`; a ref with
 * neither is matched on kind alone.
 */
export function isKubeadmControlPlaneRef(ref: ControlPlaneRef): boolean {
  if (ref.kind !== ControlPlane.kind) {
    return false;
  }

  const group = ref.apiGroup ?? ref.apiVersion?.split('/')[0];

  return group === undefined || group === ControlPlane.group;
}
