import { ResourceRequestsTable } from '../../kratix/ResourceRequestsTable';
import { entityRouteRef, useEntity } from '@backstage/plugin-catalog-react';
import { useRouteRef } from '@backstage/core-plugin-api';

type KratixResource = {
  installationName: string;
  kind: string;
  name: string;
  namespace: string;
};

export function EntityKratixResourcesCard() {
  const { entity } = useEntity();

  const entityRoute = useRouteRef(entityRouteRef);
  const baseRoute = entityRoute({
    kind: entity.kind.toLocaleLowerCase('en-US'),
    namespace:
      entity.metadata.namespace?.toLocaleLowerCase('en-US') ?? 'default',
    name: entity.metadata.name,
  });

  const kratixResources = entity.metadata.kratixResources;
  if (!kratixResources) {
    return null;
  }

  return (
    <ResourceRequestsTable
      kratixResources={kratixResources as KratixResource[]}
      baseRoute={baseRoute}
    />
  );
}
