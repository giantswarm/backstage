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
