/**
 * This file was automatically generated, PLEASE DO NOT MODIFY IT BY HAND.
 */

import * as metav1 from '../../metav1';

/**
 * Organization represents schema for managed Kubernetes namespace.
 * Reconciled by organization-operator.
 */
export interface IOrganization {
  /**
   * APIVersion defines the versioned schema of this representation of an object.
   * Servers should convert recognized schemas to the latest internal value, and
   * may reject unrecognized values.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'v1alpha1';
  /**
   * Kind is a string value representing the REST resource this object represents.
   * Servers may infer this from the endpoint the client submits requests to.
   * Cannot be updated.
   * In CamelCase.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: 'Organization';
  metadata: metav1.IObjectMeta;
  /**
   * OrganizationSpec defines the desired state of Organization
   */
  spec?: {};
  /**
   * OrganizationStatus defines the observed state of Organization
   */
  status?: {
    /**
     * Namespace is the namespace containing the resources for this organization.
     */
    namespace?: string;
  };
}
