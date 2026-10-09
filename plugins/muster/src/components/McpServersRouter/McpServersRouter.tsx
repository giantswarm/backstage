import { Routes, Route } from 'react-router-dom';
import { useScrollToTopOnNavigation } from '@giantswarm/backstage-plugin-ui-react';

import { NewMcpServerFormProvider } from '../NewMcpServerFormProvider';
import { NewMcpServerEditGate } from '../NewMcpServerEditGate';
import { McpServersPage } from '../McpServersPage';
import { NewMcpServerPage } from '../NewMcpServerPage';
import { NewMcpServerAuthPage } from '../NewMcpServerAuthPage';
import { NewMcpServerReviewPage } from '../NewMcpServerReviewPage';
import { NewMcpServerVerifyPage } from '../NewMcpServerVerifyPage';
import { ServerPage } from '../ServerPage';
import { ToolPage } from '../ToolPage';
import { useAgentShell } from '../../hooks/useAgentShell';

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
 * Inside the agent-platform shell a server's route is a branch of its own, so
 * the shell's connector page can change without touching the classic one.
 */
export const McpServersRouter = () => {
  // A wizard step, a server or a tool page opens at its top.
  useScrollToTopOnNavigation();
  const agentShell = useAgentShell();
  return (
    <NewMcpServerFormProvider>
      <Routes>
        <Route index element={<McpServersPage />} />
        <Route
          path="new"
          element={
            <NewMcpServerEditGate>
              <NewMcpServerPage />
            </NewMcpServerEditGate>
          }
        />
        <Route
          path="new/auth"
          element={
            <NewMcpServerEditGate>
              <NewMcpServerAuthPage />
            </NewMcpServerEditGate>
          }
        />
        <Route
          path="new/review"
          element={
            <NewMcpServerEditGate>
              <NewMcpServerReviewPage />
            </NewMcpServerEditGate>
          }
        />
        <Route
          path="new/verify"
          element={
            <NewMcpServerEditGate>
              <NewMcpServerVerifyPage />
            </NewMcpServerEditGate>
          }
        />
        <Route path=":server/tools/:tool" element={<ToolPage />} />
        {agentShell ? (
          <Route path=":server/*" element={<ServerPage />} />
        ) : (
          <Route path=":server/*" element={<ServerPage />} />
        )}
      </Routes>
    </NewMcpServerFormProvider>
  );
};
