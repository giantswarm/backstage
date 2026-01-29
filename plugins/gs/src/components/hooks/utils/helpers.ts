import type { IncompatibilityState } from '@giantswarm/backstage-plugin-kubernetes-react';

export const getIncompatibilityMessage = (
  incompatibility: IncompatibilityState,
): string => {
  const clientVersionsStr = incompatibility.clientVersions.join(', ');
  const serverVersionsStr =
    incompatibility.serverVersions.length > 0
      ? incompatibility.serverVersions.join(', ')
      : 'none';

  return `API version incompatibility for ${incompatibility.resourceClass} on cluster "${incompatibility.cluster}". Client supports: [${clientVersionsStr}], server provides: [${serverVersionsStr}].`;
};

export const getErrorMessage = ({
  error,
  resourceKind,
  resourceName,
  resourceNamespace,
}: {
  error: any;
  resourceKind: string;
  resourceName: string;
  resourceNamespace?: string;
}) => {
  if (!error) {
    return undefined;
  }

  if (error.name === 'ForbiddenError') {
    return `Permission not sufficient to get ${resourceKind} resource named "${resourceName}" in namespace "${resourceNamespace}".`;
  }

  return `Failed to fetch ${resourceKind} resource named "${resourceName}" in namespace "${resourceNamespace}".`;
};
