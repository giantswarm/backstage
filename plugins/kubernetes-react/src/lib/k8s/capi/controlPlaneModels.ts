import { ResourceRef } from '../resourceRef';
import { AzureASOManagedControlPlane } from './AzureASOManagedControlPlane';
import { ControlPlane } from './ControlPlane';

/**
 * The control plane kinds the plugins can read a Kubernetes version from.
 *
 * A Cluster's `spec.controlPlaneRef` names one of these kinds. A kind that is
 * not listed (an EKS cluster's `AWSManagedControlPlane`, say) has no model and
 * is not fetched. To support another kind, add its model here and give it a
 * `useResources` branch in `useControlPlanesForClusters`.
 */
export const CONTROL_PLANE_MODELS = [
  ControlPlane,
  AzureASOManagedControlPlane,
] as const;

/** A model class from {@link CONTROL_PLANE_MODELS}. */
export type ControlPlaneModel = (typeof CONTROL_PLANE_MODELS)[number];

/** An object read through any model in {@link CONTROL_PLANE_MODELS}. */
export type AnyControlPlane = InstanceType<ControlPlaneModel>;

/**
 * The model whose kind and API group a control plane reference names, or
 * `undefined` for a kind the plugins cannot read.
 */
export function findControlPlaneModel(
  ref: ResourceRef,
): ControlPlaneModel | undefined {
  return CONTROL_PLANE_MODELS.find(model => model.matchesRef(ref));
}
