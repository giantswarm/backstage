import React, { useState } from 'react';
import {
  catalogApiRef,
  EntityRefLink,
  useEntity,
} from '@backstage/plugin-catalog-react';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import { InfoCard, Link, Progress } from '@backstage/core-components';
import useAsync from 'react-use/esm/useAsync';
import { Link as RouterLink } from 'react-router-dom';
import { entityKratixResourcesRouteRef } from '../../../routes';
import { IconButton } from '@material-ui/core';
import CachedIcon from '@material-ui/icons/Cached';
import { Entity } from '@backstage/catalog-model';

export function EntityKratixStatusCard() {
  const { entity } = useEntity();

  const catalogApi = useApi(catalogApiRef);
  const targetEntityRef = {
    kind: 'component',
    namespace: 'default',
    name: entity.metadata.name,
  };

  const [targetEntity, setTargetEntity] = useState<Entity | undefined>();
  const [stale, setStale] = useState(true);
  const { loading } = useAsync(async () => {
    if (stale) {
      const result = await catalogApi.getEntityByRef(targetEntityRef);
      setStale(false);
      setTargetEntity(result);
    }
  }, [stale]);

  const kratixResourcesRoute = useRouteRef(entityKratixResourcesRouteRef);

  const handleRefreshClick = () => {
    setStale(true);
  };

  if (loading) {
    return (
      <InfoCard title="Target entity">
        <Progress />
      </InfoCard>
    );
  }

  return (
    <InfoCard
      title="Target entity"
      action={
        <>
          {!targetEntity && (
            <IconButton
              aria-label="Refresh"
              title="Refresh"
              onClick={handleRefreshClick}
            >
              <CachedIcon />
            </IconButton>
          )}
        </>
      }
    >
      {targetEntity ? (
        <>
          Target component is ready.{' '}
          <EntityRefLink entityRef={targetEntity}>
            Open in catalog.
          </EntityRefLink>
        </>
      ) : (
        <>
          Target component is not available yet. See{' '}
          <Link component={RouterLink} to={kratixResourcesRoute()}>
            Kratix resources
          </Link>{' '}
          for more information.
        </>
      )}
    </InfoCard>
  );
}
