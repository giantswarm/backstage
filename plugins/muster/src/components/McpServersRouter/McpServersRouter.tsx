import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';

import { NewMcpServerFormProvider } from '../NewMcpServerFormProvider';
import { McpServersPage } from '../McpServersPage';
import { NewMcpServerPage } from '../NewMcpServerPage';
import { NewMcpServerAuthPage } from '../NewMcpServerAuthPage';

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
 * `/agent-platform/muster/servers/new` and `.../new/auth` — the same shape as
 * agent creation's AgentsRouter. Mounted inside MusterProviders by
 * MusterSection, so the wizard shares the section's active installation.
 *
 * Steps 3 (review & register) and 4 (verify) land with the increment that also
 * wires the "Register server" entry point into the page header.
 */
export const McpServersRouter = () => {
  return (
    <NewMcpServerFormProvider>
      <ScrollToTop />
      <Routes>
        <Route index element={<McpServersPage />} />
        <Route path="new" element={<NewMcpServerPage />} />
        <Route path="new/auth" element={<NewMcpServerAuthPage />} />
      </Routes>
    </NewMcpServerFormProvider>
  );
};
