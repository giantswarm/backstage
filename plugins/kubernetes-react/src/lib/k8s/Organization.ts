import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type OrganizationInterface = crds.giantswarm.v1alpha1.Organization;

export class Organization extends KubeObject<OrganizationInterface> {
  static apiVersion = 'v1alpha1';
  static group = 'security.giantswarm.io';
  static kind = 'Organization' as const;
  static plural = 'organizations';
}
