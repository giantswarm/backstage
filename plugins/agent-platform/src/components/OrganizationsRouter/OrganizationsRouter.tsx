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
  const { installation, name } = useParams();
  if (!installation || !name) {
    return null;
  }
  // One page per organization: its state (an open delete dialog, a delete
  // it made) belongs to that organization and must not carry over when the
  // address names another, as it would with the page reused.
  return (
    <OrganizationPage
      key={`${installation}/${name}`}
      installation={installation}
      name={name}
    />
  );
}

function CredentialFormRoute() {
  const { installation, name, operation } = useParams();
  if (!installation || !name || !operation) {
    return null;
  }
  return (
    <CredentialFormPage
      key={`${installation}/${name}/${operation}`}
      installation={installation}
      name={name}
      operation={operation}
    />
  );
}

/**
 * The pages under `/organizations`: the bare path lists the organizations
 * the person belongs to, `<installation>/<name>` is one
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
              path=":installation/:name/credentials/:operation"
              element={<CredentialFormRoute />}
            />
            <Route
              path=":installation/:name/*"
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
