import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';

import { NewMcpServerFormProvider } from '../NewMcpServerFormProvider';
import { NewMcpServerEditGate } from '../NewMcpServerEditGate';
import { McpServersPage } from '../McpServersPage';
import { NewMcpServerPage } from '../NewMcpServerPage';
import { NewMcpServerAuthPage } from '../NewMcpServerAuthPage';
import { NewMcpServerReviewPage } from '../NewMcpServerReviewPage';
import { NewMcpServerVerifyPage } from '../NewMcpServerVerifyPage';

// react-router keeps the window scroll position across client-side navigation,
// so moving between wizard steps would otherwise land mid-page. Reset to the
// top on every in-flow navigation. Same as agent creation's AgentsRouter.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * Routing within the Servers view: the server manager and the registration
 * wizard's steps. The steps are sub-routes sharing one NewMcpServerFormProvider
 * so the composed definition survives navigation across
 * `/agent-platform/muster/servers/new` and its step sub-routes — the same
 * shape as agent creation's AgentsRouter. Mounted inside MusterProviders by
 * MusterSection, so the wizard shares the section's active installation.
 * Editing a registered server runs through the same steps with `?edit=<name>`
 * (see NewMcpServerEditGate), so the routes — and their telemetry page names —
 * are the same for both.
 */
export const McpServersRouter = () => {
  return (
    <NewMcpServerFormProvider>
      <ScrollToTop />
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
      </Routes>
    </NewMcpServerFormProvider>
  );
};
