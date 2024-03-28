import {
  MissingAnnotationEmptyState,
  useEntity,
} from '@backstage/plugin-catalog-react';
import { Route, Routes } from 'react-router-dom';
import { EntityDeploymentsContent } from './EntityDeploymentsContent';
import { entityDeploymentDetailsRouteRef } from '../routes';
import React from 'react';
import {
  GS_DEPLOYMENT_NAMES,
  isEntityDeploymentsAvailable,
} from './utils/entity';

const GS_PLUGIN_README_URL =
  'https://github.com/giantswarm/backstage/tree/main/plugins/gs';

/** @public */
export const Router = () => {
  const { entity } = useEntity();

  if (!isEntityDeploymentsAvailable(entity)) {
    return (
      <MissingAnnotationEmptyState
        annotation={GS_DEPLOYMENT_NAMES}
        readMoreUrl={GS_PLUGIN_README_URL}
      />
    );
  }

  return (
    <Routes>
      <Route path="/" element={<EntityDeploymentsContent />} />
      <Route
        path={`${entityDeploymentDetailsRouteRef.path}`}
        element={<EntityDeploymentsContent />}
      />
    </Routes>
  );
};
