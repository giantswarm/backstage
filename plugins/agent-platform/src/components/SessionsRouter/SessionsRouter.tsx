import { Route, Routes } from 'react-router-dom';

import { QueryClientProvider } from '../QueryClientProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { SessionsIndexPage } from '../SessionsIndexPage';
import { SessionDetailPage } from '../SessionDetailPage';

/**
 * Content of the "Sessions" tab: the fleet-wide list, and one session's detail.
 *
 * Mounted as the tab's content (a descendant `<Routes>`), so paths here are
 * relative — no leading slash — matching AgentsRouter and muster's WorkflowsRouter.
 *
 * The providers are hoisted above the routes so both screens share one query cache
 * and one fleet-wide Agent list. That matters for navigation between them: opening
 * a session reuses the agents already loaded for the list, so its agent name and
 * avatar render immediately instead of re-querying the fleet.
 *
 * `AgentsDataProvider` requires `ModelConfigsProvider` above it, so the Sessions
 * tab pays for a fleet-wide ModelConfig list neither screen uses. It is cached,
 * persisted, and shared with the Agents tab, so in practice it is free.
 */
export const SessionsRouter = () => {
  return (
    <QueryClientProvider>
      <ModelConfigsProvider>
        <AgentsDataProvider>
          <Routes>
            <Route index element={<SessionsIndexPage />} />
            {/* Both parameters are needed to resolve a session: kagent ids are
                only unique within an installation. */}
            <Route
              path=":installation/:sessionId"
              element={<SessionDetailPage />}
            />
          </Routes>
        </AgentsDataProvider>
      </ModelConfigsProvider>
    </QueryClientProvider>
  );
};
