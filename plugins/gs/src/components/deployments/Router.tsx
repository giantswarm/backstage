import { Routes, Route } from 'react-router-dom';
import { DeploymentsPage } from './DeploymentsPage';
import { deploymentDetailsRouteRef } from '../../routes';
import { DeploymentDetailsPage } from './DeploymentDetailsPage';

export const Router = () => {
  return (
    <Routes>
      <Route path="/" element={<DeploymentsPage />} />
      <Route
        path={`${deploymentDetailsRouteRef.path}`}
        element={<DeploymentDetailsPage />}
      />
    </Routes>
  );
};
