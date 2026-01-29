import type { IncompatibilityState } from './VersionTypes';

/**
 * Generate a human-readable error message for API version incompatibility.
 */
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

/**
 * Generate a human-readable error message for resource fetch errors.
 */
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
