import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type OrganizationInterface = crds.giantswarm.v1alpha1.Organization;

export class Organization extends KubeObject<OrganizationInterface> {
  static readonly supportedVersions = ['v1alpha1'] as const;
  static readonly group = 'security.giantswarm.io';
  static readonly kind = 'Organization' as const;
  static readonly plural = 'organizations';
}
