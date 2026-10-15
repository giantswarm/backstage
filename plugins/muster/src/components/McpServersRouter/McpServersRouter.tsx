import type { ReactElement } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useScrollToTopOnNavigation } from '@giantswarm/backstage-plugin-ui-react';

import { newMcpServerAuthRouteRef } from '../../routes';
import { NewMcpServerFormProvider } from '../NewMcpServerFormProvider';
import { NewMcpServerEditGate } from '../NewMcpServerEditGate';
import {
  NewConnectorConnectPage,
  NewConnectorSignInPage,
  NewConnectorTestPage,
} from '../NewConnectorWizard';
import { ConnectorPage } from '../ConnectorPage';
import { CustomizeTabRedirect } from '../CustomizeTabRedirect';
import { ToolPage } from '../ToolPage';

/**
 * The wizard has no review step — step 2's "Add connector" registers
 * directly — so the old review address sends to the Sign-in step, keeping
 * old links (and an in-flight edit's `?edit=`) working.
 */
const ShellReviewRedirect = () => {
  const signInLink = useRouteRef(newMcpServerAuthRouteRef);
  const { search } = useLocation();
  return (
    <Navigate
      to={signInLink ? { pathname: signInLink(), search } : '..'}
      replace
    />
  );
};

/**
 * Routing within the Agent Platform's Connectors sub-page: a page per
 * connector (and per tool beneath it) and the registration wizard's steps.
 * The list itself is the Customize screen's Connectors tab, so the index sends
 * there. The wizard's static `new` segments outrank `:server`. The steps are
 * sub-routes sharing one NewMcpServerFormProvider so the composed definition
 * survives navigation across `/agent-platform/connectors/new` and its step
 * sub-routes — the same shape as agent creation's AgentsRouter. Mounted inside
 * MusterProviders by the sub-page, so the wizard shares its active
 * installation. Editing a registered connector runs through the same steps
 * with `?edit=<name>` (see NewMcpServerEditGate), so the routes — and their
 * telemetry page names — are the same for both.
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
        <Route index element={<CustomizeTabRedirect tab="connectors" />} />
        {/* The prototype's three-step wizard (Connect / Sign-in / Test). */}
        <Route
          path="new"
          element={
            <NewMcpServerEditGate>
              <NewConnectorConnectPage />
            </NewMcpServerEditGate>
          }
        />
        <Route
          path="new/auth"
          element={
            <NewMcpServerEditGate>
              <NewConnectorSignInPage />
            </NewMcpServerEditGate>
          }
        />
        <Route path="new/review" element={<ShellReviewRedirect />} />
        <Route
          path="new/verify"
          element={
            <NewMcpServerEditGate>
              <NewConnectorTestPage />
            </NewMcpServerEditGate>
          }
        />
        <Route path=":server/tools/:tool" element={<ToolPage />} />
        <Route path=":server/*" element={<ConnectorPage usedBy={usedBy} />} />
      </Routes>
    </NewMcpServerFormProvider>
  );
};
