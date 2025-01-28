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
