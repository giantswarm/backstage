import { Entity } from '@backstage/catalog-model';
import { GS_APP_FLAVOR_LABEL } from './getAppNameFromEntity';
import { useEntity } from '@backstage/plugin-catalog-react';
import { Route, Routes } from 'react-router-dom';
import { EntityDeploymentsContent } from './EntityDeploymentsContent';
import { entityDeploymentDetailsRouteRef } from '../routes';
import React from 'react';
import { EmptyState } from '@backstage/core-components';

export const isGSDeploymentsAvailable = (entity: Entity) =>
  entity.metadata.labels?.[GS_APP_FLAVOR_LABEL] === 'true';

/** @public */
export const Router = () => {
  const { entity } = useEntity();

  if (!isGSDeploymentsAvailable(entity)) {
    return (
      <EmptyState
        title="Deployments content is not available for this entity"
        missing="info"
        description="There appears to be no deployment information for this component. That should not happen normally. Please report this problem. Thanks!"
      />
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={(
            <EntityDeploymentsContent />
        )}
      />
      <Route
        path={`${entityDeploymentDetailsRouteRef.path}`}
        element={(
            <EntityDeploymentsContent />
        )}
      />
    </Routes>
  );
};
