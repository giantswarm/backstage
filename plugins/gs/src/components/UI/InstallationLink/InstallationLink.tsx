import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { useInstallationEntityNames } from '../../hooks/useInstallationEntityNames';

type InstallationLinkProps = {
  installationName: string;
};

/**
 * An installation's name, linked to its catalog page where the catalog has
 * the installation's entity, and plain text where it has none or has not
 * answered yet. The link is the bare name, with no entity icon, so the text
 * keeps its place when the catalog's answer turns it into a link.
 */
export const InstallationLink = ({
  installationName,
}: InstallationLinkProps) => {
  const { installationEntityNames } = useInstallationEntityNames();

  if (!installationEntityNames?.has(installationName)) {
    return <>{installationName}</>;
  }

  return (
    <EntityRefLink
      entityRef={{
        kind: 'resource',
        namespace: 'default',
        name: installationName,
      }}
      title={installationName}
      underline="always"
    />
  );
};
