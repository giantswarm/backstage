import type { ReactElement } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useScrollToTopOnNavigation } from '@giantswarm/backstage-plugin-ui-react';

import { newMcpServerAuthRouteRef } from '../../routes';
import { NewMcpServerFormProvider } from '../NewMcpServerFormProvider';
import { NewMcpServerEditGate } from '../NewMcpServerEditGate';
import { McpServersPage } from '../McpServersPage';
import { NewMcpServerPage } from '../NewMcpServerPage';
import { NewMcpServerAuthPage } from '../NewMcpServerAuthPage';
import { NewMcpServerReviewPage } from '../NewMcpServerReviewPage';
import { NewMcpServerVerifyPage } from '../NewMcpServerVerifyPage';
import {
  NewConnectorConnectPage,
  NewConnectorSignInPage,
  NewConnectorTestPage,
} from '../NewConnectorWizard';
import { ConnectorPage } from '../ConnectorPage';
import { CustomizeTabRedirect } from '../CustomizeTabRedirect';
import { ServerPage } from '../ServerPage';
import { ToolPage } from '../ToolPage';
import { useAgentShell } from '../../hooks/useAgentShell';

/**
 * The shell wizard has no review step — step 2's "Add connector" registers
 * directly — so its address sends to the Sign-in step, keeping classic links
 * (and an in-flight edit's `?edit=`) working inside the shell.
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
 * Routing within the Agent Platform's MCP Servers tab: the servers table, a
 * page per server (and per tool beneath it) and the registration wizard's
 * steps. The wizard's static `new` segments outrank `:server`. The steps are
 * sub-routes sharing one NewMcpServerFormProvider so the composed definition
 * survives navigation across `/agent-platform/mcp-servers/new` and its step
 * sub-routes — the same shape as agent creation's AgentsRouter. Mounted inside
 * MusterProviders by the MCP Servers sub-page, so the wizard shares the tab's
 * active installation.
 * Editing a registered server runs through the same steps with `?edit=<name>`
 * (see NewMcpServerEditGate), so the routes — and their telemetry page names —
 * are the same for both.
 *
 * Inside the agent-platform shell a server's route renders the shell's
 * connector page instead, whose Used by tab is the `usedBy` element another
 * plugin attaches; the classic server page is unchanged outside the shell.
 */
export const McpServersRouter = ({ usedBy }: { usedBy?: ReactElement }) => {
  // A wizard step, a server or a tool page opens at its top.
  useScrollToTopOnNavigation();
  const agentShell = useAgentShell();
  return (
    // The shell's wizard leads with Company login, as the design does; the
    // classic pages keep starting from no sign-in.
    <NewMcpServerFormProvider
      initialAuthMode={agentShell ? 'platform-sso' : undefined}
    >
      <Routes>
        {/* Inside the shell the list is the Customize screen's Connectors
            tab; the classic list page stays for the classic chrome. */}
        <Route
          index
          element={
            agentShell ? (
              <CustomizeTabRedirect
                tab="connectors"
                fallback={<McpServersPage />}
              />
            ) : (
              <McpServersPage />
            )
          }
        />
        {/* The registration wizard's steps, on the same addresses in both
            chromes: the shell renders the prototype's three-step wizard
            (Connect / Sign-in / Test) in the content area, classic keeps the
            four-step pages — the same shell/classic split as the server
            routes below. */}
        <Route
          path="new"
          element={
            <NewMcpServerEditGate>
              {agentShell ? <NewConnectorConnectPage /> : <NewMcpServerPage />}
            </NewMcpServerEditGate>
          }
        />
        <Route
          path="new/auth"
          element={
            <NewMcpServerEditGate>
              {agentShell ? (
                <NewConnectorSignInPage />
              ) : (
                <NewMcpServerAuthPage />
              )}
            </NewMcpServerEditGate>
          }
        />
        <Route
          path="new/review"
          element={
            agentShell ? (
              <ShellReviewRedirect />
            ) : (
              <NewMcpServerEditGate>
                <NewMcpServerReviewPage />
              </NewMcpServerEditGate>
            )
          }
        />
        <Route
          path="new/verify"
          element={
            <NewMcpServerEditGate>
              {agentShell ? (
                <NewConnectorTestPage />
              ) : (
                <NewMcpServerVerifyPage />
              )}
            </NewMcpServerEditGate>
          }
        />
        <Route path=":server/tools/:tool" element={<ToolPage />} />
        {agentShell ? (
          <Route path=":server/*" element={<ConnectorPage usedBy={usedBy} />} />
        ) : (
          <Route path=":server/*" element={<ServerPage />} />
        )}
      </Routes>
    </NewMcpServerFormProvider>
  );
};
