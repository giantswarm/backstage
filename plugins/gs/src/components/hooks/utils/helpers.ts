import { InstallationObjectRef } from '@giantswarm/backstage-plugin-gs-common';

export const getUniqueRefsByNamespace = (
  objectRefs: InstallationObjectRef[],
) => {
  return objectRefs
    .map(ref => {
      return {
        apiVersion: ref.apiVersion,
        kind: ref.kind,
        namespace: ref.namespace,
        installationName: ref.installationName,
      };
    })
    .filter(
      (ref, index, self) =>
        index ===
        self.findIndex(
          r =>
            r.installationName === ref.installationName &&
            r.kind === ref.kind &&
            r.apiVersion === ref.apiVersion &&
            r.namespace === ref.namespace,
        ),
    );
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
