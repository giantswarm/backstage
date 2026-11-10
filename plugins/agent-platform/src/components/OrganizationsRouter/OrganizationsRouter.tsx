import { Route, Routes, useParams } from 'react-router-dom';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { organizationsRouteRef } from '../../routes';
import { CredentialFormPage } from '../CredentialFormPage';
import { OrganizationDirectoryProvider } from '../OrganizationDirectoryProvider';
import { OrganizationPage } from '../OrganizationPage';
import { OrganizationsIndexPage } from '../OrganizationsIndexPage';
import { QueryClientProvider } from '../QueryClientProvider';
import { RouteRefRedirect } from '../RouteRefRedirect';

function OrganizationRoute() {
  const { installation, parent, name } = useParams();
  if (!installation || !parent || !name) {
    return null;
  }
  return (
    <OrganizationPage installation={installation} parent={parent} name={name} />
  );
}

function CredentialFormRoute() {
  const { installation, parent, name, operation } = useParams();
  if (!installation || !parent || !name || !operation) {
    return null;
  }
  return (
    <CredentialFormPage
      installation={installation}
      parent={parent}
      name={name}
      operation={operation}
    />
  );
}

/**
 * The pages under `/organizations`: the bare path lists the organizations
 * the person belongs to, `<installation>/<parent>/<name>` is one
 * organization's page (its tabs below it), and its `credentials/<operation>`
 * the credential form of one request; anything else goes to the list.
 * Its own `PageHeaderActionsProvider`, since the page renders without the
 * app's page layout (`noHeader`).
 */
export function OrganizationsRouter() {
  return (
    <QueryClientProvider>
      <OrganizationDirectoryProvider>
        <PageHeaderActionsProvider>
          <Routes>
            <Route index element={<OrganizationsIndexPage />} />
            <Route
              path=":installation/:parent/:name/credentials/:operation"
              element={<CredentialFormRoute />}
            />
            <Route
              path=":installation/:parent/:name/*"
              element={<OrganizationRoute />}
            />
            <Route
              path="*"
              element={<RouteRefRedirect routeRef={organizationsRouteRef} />}
            />
          </Routes>
        </PageHeaderActionsProvider>
      </OrganizationDirectoryProvider>
    </QueryClientProvider>
  );
}
