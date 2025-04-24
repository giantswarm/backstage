import { Routes, Route } from 'react-router-dom';
import { clusterDetailsRouteRef } from '../../routes';
import { ClustersPage } from './ClustersPage';
import { ClusterDetailsPage } from './ClusterDetailsPage';

export const Router = () => {
  return (
    <Routes>
      <Route path="/" element={<ClustersPage />} />
      <Route
        path={`${clusterDetailsRouteRef.path}`}
        element={<ClusterDetailsPage />}
      />
    </Routes>
  );
};
