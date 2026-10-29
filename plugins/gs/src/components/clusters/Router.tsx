import { ReactElement } from 'react';
import { Routes, Route } from 'react-router-dom';
import { clusterDetailsRouteRef } from '../../routes';
import { ClustersPage } from './ClustersPage';
import { ClusterDetailsPage } from './ClusterDetailsPage';

export type RouterProps = {
  /** Actions other plugins attach beside the list's header (`listActions`). */
  listActions?: ReactElement[];
  /** Actions other plugins attach beside a cluster's header (`clusterActions`). */
  clusterActions?: ReactElement[];
};

export const Router = ({ listActions, clusterActions }: RouterProps) => {
  return (
    <Routes>
      <Route path="/" element={<ClustersPage actions={listActions} />} />
      <Route
        path={`${clusterDetailsRouteRef.path}`}
        element={<ClusterDetailsPage actions={clusterActions} />}
      />
    </Routes>
  );
};
