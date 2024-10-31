import { Organization } from '../types';

import * as giantswarmSecurity from '../../model/giantswarm-security';

export function getOrganizationNames() {
  return giantswarmSecurity.OrganizationNames;
}

export function getOrganizationGVK(apiVersion: string) {
  const gvk = giantswarmSecurity.getOrganizationGVK(apiVersion);
  const kind = giantswarmSecurity.OrganizationKind;

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export function getOrganizationName(organization: Organization): string {
  return organization.metadata.name;
}
