import { useRouteRef } from '@backstage/frontend-plugin-api';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { installationsRouteRef } from '../../../routes';
import { useInstallationEntityNames } from '../../hooks/useInstallationEntityNames';

type InstallationLinkProps = {
  installationName: string;
};

export const InstallationLink = ({
  installationName,
}: InstallationLinkProps) => {
  // The installations page can be disabled (a customer portal); and where it
  // is enabled, not every configured installation has a catalog entity.
  const installationsRouteLink = useRouteRef(installationsRouteRef);
  const { installationEntityNames } = useInstallationEntityNames({
    enabled: Boolean(installationsRouteLink),
  });

  if (
    !installationsRouteLink ||
    !installationEntityNames?.has(installationName)
  ) {
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
    />
  );
};
