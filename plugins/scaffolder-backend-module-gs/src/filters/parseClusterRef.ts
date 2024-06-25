import { InputError } from '@backstage/errors';

const clusterRefRegexp =
  /^(?<installationName>[a-z0-9]+)\/(?<clusterName>[a-z](?:[-a-z0-9]*[a-z0-9]))?$/;

export const parseClusterRef = (
  ref: string,
): {
  installationName: string;
  clusterName: string;
} => {
  const match = ref.match(clusterRefRegexp);
  if (!match || !match.groups) {
    throw new InputError(
      `Invalid cluster reference passed to publisher, got ${ref}`,
    );
  }

  return {
    installationName: match.groups.installationName,
    clusterName: match.groups.clusterName,
  };
};
