import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { Navigate } from 'react-router-dom';
import { HomePage } from './HomePage';

/**
 * A redirect target must be an in-app path other than `/` itself, which this
 * page owns: `/` redirects to itself forever, and a value without a leading
 * slash resolves relative to `/` and reaches an unintended route.
 */
function isInAppPath(rootRedirect: string) {
  return rootRedirect.startsWith('/') && rootRedirect !== '/';
}

/**
 * The page mounted at `/`. Renders the home page, unless `app.rootRedirect`
 * points at another in-app path.
 */
export function RootPage() {
  const configApi = useApi(configApiRef);
  const rootRedirect = configApi.getOptionalString('app.rootRedirect');

  if (rootRedirect) {
    if (isInAppPath(rootRedirect)) {
      return <Navigate to={rootRedirect} replace />;
    }

    // eslint-disable-next-line no-console
    console.warn(
      `Ignoring app.rootRedirect "${rootRedirect}": expected an in-app path that starts with "/" and is not "/" itself.`,
    );
  }

  return <HomePage />;
}
