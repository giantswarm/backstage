import { ResourceRequestsTable } from '../../kratix/ResourceRequestsTable';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useRouteRef } from '@backstage/core-plugin-api';
import { GSContext } from '../../GSContext';
import { entityKratixResourcesRouteRef } from '../../../routes';
import {
  Content,
  ContentHeader,
  SupportButton,
} from '@backstage/core-components';

type KratixResource = {
  installationName: string;
  kind: string;
  name: string;
  namespace: string;
};

export const EntityKratixResourcesContent = () => {
  const { entity } = useEntity();

  const entityName = entity.metadata.name;

  const kratixResourcesRoute = useRouteRef(entityKratixResourcesRouteRef);
  const baseRoute = kratixResourcesRoute();

  const kratixResources = entity.metadata.kratixResources;
  if (!kratixResources) {
    return null;
  }

  return (
    <GSContext>
      <Content>
        <ContentHeader title={`Kratix resource requests of ${entityName}`}>
          <SupportButton>{`This table shows all the Kratix resource requests found for ${entityName} component.`}</SupportButton>
        </ContentHeader>
        <ResourceRequestsTable
          kratixResources={kratixResources as KratixResource[]}
          baseRoute={baseRoute}
        />
      </Content>
    </GSContext>
  );
};
