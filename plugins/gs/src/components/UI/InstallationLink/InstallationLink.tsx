import { EntityRefLink } from '@backstage/plugin-catalog-react';
import {
  installationNameKey,
  useInstallationEntityNames,
} from '../../hooks/useInstallationEntityNames';

type InstallationLinkProps = {
  installationName: string;
};

/**
 * An installation's name, linked to its catalog page where the catalog has
 * the installation's entity, and plain text where it has none or has not
 * answered yet. The link is the bare name, with no entity icon, so the text
 * keeps its place when the catalog's answer turns it into a link.
 *
 * The plain name says in `data-installation-entity` whether the catalog has
 * answered (`none`) or not yet (`pending`), so a test can tell the settled
 * plain text from the text before the answer.
 */
export const InstallationLink = ({
  installationName,
}: InstallationLinkProps) => {
  const { installationEntityNames } = useInstallationEntityNames();

  if (!installationEntityNames?.has(installationNameKey(installationName))) {
    return (
      <span
        data-installation-entity={installationEntityNames ? 'none' : 'pending'}
      >
        {installationName}
      </span>
    );
  }

  return (
    <EntityRefLink
      entityRef={{
        kind: 'resource',
        namespace: 'default',
        name: installationName,
      }}
      underline="always"
    >
      {installationName}
    </EntityRefLink>
  );
};
