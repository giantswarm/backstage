import type { ReactElement } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useScrollToTopOnNavigation } from '@giantswarm/backstage-plugin-ui-react';

import { NewMcpServerFormProvider } from '../NewMcpServerFormProvider';
import { NewMcpServerEditGate } from '../NewMcpServerEditGate';
import {
  NewConnectorConnectPage,
  NewConnectorSignInPage,
  NewConnectorTestPage,
} from '../NewConnectorWizard';
import { ConnectorPage } from '../ConnectorPage';
import { MusterSubPage } from '../MusterSubPage';
import { RouteRefRedirect } from '../RouteRefRedirect';
import { mcpServersRouteRef } from '../../routes';
import { ToolPage } from '../ToolPage';

const CONTEXT =
  'The connectors of an environment are read through its Kubernetes API.';

/** An unknown address under the tab: the nearest valid parent, the list. */
const listRedirect = <RouteRefRedirect routeRef={mcpServersRouteRef} />;

/** The wizard's steps, for a new connector or (`edit`) a registered one. */
const wizardSteps = (
  <>
    {/* The prototype's three-step wizard (Connect / Sign-in / Test). */}
    <Route
      index
      element={
        <NewMcpServerEditGate step="connect">
          <NewConnectorConnectPage />
        </NewMcpServerEditGate>
      }
    />
    <Route
      path="auth"
      element={
        <NewMcpServerEditGate step="auth">
          <NewConnectorSignInPage />
        </NewMcpServerEditGate>
      }
    />
    <Route
      path="verify"
      element={
        <NewMcpServerEditGate step="verify">
          <NewConnectorTestPage />
        </NewMcpServerEditGate>
      }
    />
    {/* An unknown step: the wizard's first, its nearest valid parent. */}
    <Route path="*" element={<Navigate to="." replace />} />
  </>
);

/**
 * Everything under `<installation>/`: a connector's page, a tool's page
 * beneath it and the connector's edit, inside the muster providers pinned to
 * that installation, so each reads its connector there whatever the
 * section's scope.
 */
function InstallationRoutes({ usedBy }: { usedBy?: ReactElement }) {
  const { installation = '' } = useParams();
  return (
    <MusterSubPage context={CONTEXT} installation={installation}>
      <Routes>
        <Route path=":server/tools/:tool/*" element={<ToolPage />} />
        <Route path=":server/edit/*">{wizardSteps}</Route>
        <Route path=":server/*" element={<ConnectorPage usedBy={usedBy} />} />
        {/* An installation alone names no page. */}
        <Route path="*" element={listRedirect} />
      </Routes>
    </MusterSubPage>
  );
}

/**
 * Routing within the Customize screen's Connectors tab (`/customize/connectors`,
 * whose bare path and sub-tabs are the Customize screen's own): a page per
 * connector at `<installation>/<server>` (and per tool beneath it), the
 * registration wizard at `new[/auth|/verify]` and a connector's edit, the same
 * wizard prefilled, at `<installation>/<server>/edit[/auth|/verify]`. The
 * static `new` outranks an installation, so `new` is a reserved word here.
 *
 * Both wizards share one NewMcpServerFormProvider, above the muster
 * providers, so the composed definition survives navigation across the steps
 * — and a registration that becomes an edit once saved (the browser's Back
 * from Test) keeps it. The registration's steps sit in the providers that
 * follow the section's scope, where the connector is created; everything
 * under an installation in providers pinned to it.
 *
 * A connector's route renders the connector page, whose Used by tab is the
 * `usedBy` element another plugin attaches.
 */
export const McpServersRouter = ({ usedBy }: { usedBy?: ReactElement }) => {
  // A wizard step, a connector or a tool page opens at its top.
  useScrollToTopOnNavigation();
  return (
    // The wizard leads with Company login, as the design does.
    <NewMcpServerFormProvider initialAuthMode="platform-sso">
      <Routes>
        <Route
          path="new/*"
          element={
            <MusterSubPage context={CONTEXT}>
              <Routes>{wizardSteps}</Routes>
            </MusterSubPage>
          }
        />
        <Route
          path=":installation/*"
          element={<InstallationRoutes usedBy={usedBy} />}
        />
        <Route path="*" element={listRedirect} />
      </Routes>
    </NewMcpServerFormProvider>
  );
};
