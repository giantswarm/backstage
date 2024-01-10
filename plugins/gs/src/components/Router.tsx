import { useEntity } from '@backstage/plugin-catalog-react';
import { Route, Routes } from 'react-router-dom';
import { EntityDeploymentsContent } from './EntityDeploymentsContent';
import { entityDeploymentDetailsRouteRef } from '../routes';
import React from 'react';
import { EmptyState } from '@backstage/core-components';
import { isEntityDeploymentsAvailable } from './utils/entity';

/** @public */
export const Router = () => {
  const { entity } = useEntity();

  if (!isEntityDeploymentsAvailable(entity)) {
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
