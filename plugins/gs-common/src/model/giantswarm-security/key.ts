import * as v1alpha1 from './v1alpha1';

export const OrganizationKind = 'Organization';
export const OrganizationApiGroup = 'security.giantswarm.io';
export const OrganizationNames = {
  plural: 'organizations',
  singular: 'organization',
};

export function getOrganizationGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1alpha1.OrganizationGVK;
  }

  switch (apiVersion) {
    case v1alpha1.OrganizationApiVersion:
      return v1alpha1.OrganizationGVK;
    default:
      return undefined;
  }
}
