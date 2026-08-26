import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { Navigate } from 'react-router-dom';
import { HomePage } from './HomePage';

/**
 * The page mounted at `/`. Renders the home page, unless `app.rootRedirect`
 * points at another in-app path.
 */
export function RootPage() {
  const configApi = useApi(configApiRef);
  const rootRedirect = configApi.getOptionalString('app.rootRedirect');

  if (rootRedirect) {
    return <Navigate to={rootRedirect} replace />;
  }

  return <HomePage />;
}
