import { useMemo } from 'react';
import useAsync from 'react-use/esm/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { getDeploymentNamesFromEntity } from '../utils/entity';
import { stringifyEntityRef } from '@backstage/catalog-model';

export function useCatalogEntitiesForDeployments() {
  const catalogApi = useApi(catalogApiRef);
  const { value: catalogEntities } = useAsync(async () => {
    const entities = await catalogApi.getEntities({
      filter: { kind: 'component' },
    });

    return entities.items;
  });

  return useMemo(() => {
    if (!catalogEntities) {
      return {};
    }

    return catalogEntities.reduce((acc: Record<string, string>, entity) => {
      const entityDeploymentNames = getDeploymentNamesFromEntity(entity);
      if (!entityDeploymentNames) {
        return acc;
      }

      entityDeploymentNames.forEach(deploymentName => {
        acc[deploymentName] = stringifyEntityRef(entity);
      });

      return acc;
    }, {});
  }, [catalogEntities]);
}
