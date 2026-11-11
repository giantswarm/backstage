import type { OrganizationDirectoryValue } from '../../components/OrganizationDirectoryProvider';
import {
  organizationDirectory,
  type OrganizationNamespace,
} from '../organizations';

/**
 * The organizations a component test's person belongs to, as agent-manager's
 * `list_organizations` names them: each namespace with the organization
 * its labels say. The namespaces keep the names the tests used before
 * organizations were read from agent-manager; the portal no longer reads
 * anything from those names.
 */
export const TEST_ORGANIZATIONS: OrganizationNamespace[] = [
  'acme',
  'alpha',
  'beta',
  'zeta',
  'otter',
  'platform',
  'a-rather-long-organization-name',
  'deep-link',
].map(organization => ({
  namespace: `org-${organization}`,
  organization,
  parent: 'org-parent',
}));

/** `useOrganizationDirectory`'s answer with {@link TEST_ORGANIZATIONS}. */
export const TEST_ORGANIZATION_DIRECTORY: OrganizationDirectoryValue = {
  directory: organizationDirectory(TEST_ORGANIZATIONS),
  installations: [],
  discoveryErrors: [],
  organizationsOf: () => undefined,
  failureOf: () => undefined,
  recheck: async () => {},
  isLoading: false,
};
