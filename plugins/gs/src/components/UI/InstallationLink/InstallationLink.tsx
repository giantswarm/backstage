import { Link } from '@backstage/ui';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useEntityRefLink } from '@backstage/plugin-catalog-react';
import { installationsRouteRef } from '../../../routes';

type InstallationLinkProps = {
  installationName: string;
};

export const InstallationLink = ({
  installationName,
}: InstallationLinkProps) => {
  // The installations page can be disabled (a customer portal), in which case
  // the catalog has no installation entities to link to.
  const installationsRouteLink = useRouteRef(installationsRouteRef);
  const entityRefLink = useEntityRefLink();

  if (!installationsRouteLink) {
    return <>{installationName}</>;
  }

  return (
    <Link
      href={entityRefLink({
        kind: 'resource',
        namespace: 'default',
        name: installationName,
      })}
    >
      {installationName}
    </Link>
  );
};
