import { Organization } from '../types';

import * as securityv1alpha1 from '../../model/securityv1alpha1';

export const organizationGVK = [securityv1alpha1.organizationGVK];

export function getOrganizationName(organization: Organization): string {
  return organization.metadata.name;
}
