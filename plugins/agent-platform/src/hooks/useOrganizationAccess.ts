import {
  ModelConfig,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/** What the person may change inside one organization namespace. */
export type OrganizationAccess = {
  /** Add and remove members: write the namespace's RoleBindings. */
  members: boolean;
  /** Add models: create ModelConfigs. */
  models: boolean;
  /** Replace a key or a credential: replace the namespace's Secrets. */
  credentials: boolean;
  /** A review is still out: every right reads `false` until it answers. */
  isLoading: boolean;
};

/**
 * Asks the API server, with the person's token, what they may change in an
 * organization namespace, so the page offers only those actions. These are
 * the organization admin's rights (agent-platform:admin), which
 * `list_organizations`' `manage` does not report: that one is the parent
 * namespace's organizations-admin. Fails closed while a review is out or
 * failed; agent-manager still decides every write.
 */
export function useOrganizationAccess(
  installation: string,
  namespace: string,
): OrganizationAccess {
  const members = useSelfSubjectAccessReview(installation, {
    group: 'rbac.authorization.k8s.io',
    resource: 'rolebindings',
    namespace,
    verb: 'create',
  });
  const models = useSelfSubjectAccessReview(installation, {
    group: ModelConfig.group,
    resource: ModelConfig.plural,
    namespace,
    verb: 'create',
  });
  const credentials = useSelfSubjectAccessReview(installation, {
    group: '',
    resource: 'secrets',
    namespace,
    verb: 'update',
  });
  return {
    members: members.allowed,
    models: models.allowed,
    credentials: credentials.allowed,
    isLoading: members.isLoading || models.isLoading || credentials.isLoading,
  };
}
