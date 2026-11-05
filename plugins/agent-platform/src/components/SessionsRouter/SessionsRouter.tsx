import { Route, Routes } from 'react-router-dom';

import { QueryClientProvider } from '../QueryClientProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { AgentsDataProvider } from '../AgentsDataProvider';
import { ServingProvider } from '../ServingProvider';
import { SessionsIndexPage } from '../SessionsIndexPage';
import { SessionDetailRoute } from './SessionDetailRoute';
import { RouteRefRedirect } from '../RouteRefRedirect';
import { sessionsRouteRef } from '../../routes';

/**
 * Content of the Sessions page (`/sessions`): the fleet-wide list, and one
 * session's detail at `<installation>/<id>`; any other address lands on the
 * list, its nearest valid parent.
 *
 * Mounted as the page's content (a descendant `<Routes>`), so paths here are
 * relative — no leading slash — matching AgentsRouter and muster's WorkflowsRouter.
 *
 * The providers are hoisted above the routes so both screens share one query cache
 * and one fleet-wide Agent list. That matters for navigation between them: opening
 * a session reuses the agents already loaded for the list, so its agent name and
 * avatar render immediately instead of re-querying the fleet.
 *
 * `AgentsDataProvider` requires `ModelConfigsProvider` above it, so the Sessions
 * page pays for a fleet-wide ModelConfig list neither screen uses. It is cached,
 * persisted, and shared with the Agents tab, so in practice it is free.
 */
export const SessionsRouter = () => {
  return (
    <QueryClientProvider>
      <ModelConfigsProvider>
        {/* The serving snapshot (shared with the Models and Agents tabs through
            the query cache) is what the composer's warning about an agent whose
            model is not serving reads. */}
        <ServingProvider>
          <AgentsDataProvider>
            <Routes>
              <Route index element={<SessionsIndexPage />} />
              {/* Both parameters are needed to resolve a session: kagent ids
                  are only unique within an installation. One page instance
                  per session, see `SessionDetailRoute`. */}
              <Route
                path=":installation/:sessionId"
                element={<SessionDetailRoute />}
              />
              {/* An address that names no session: the list. */}
              <Route
                path="*"
                element={<RouteRefRedirect routeRef={sessionsRouteRef} />}
              />
            </Routes>
          </AgentsDataProvider>
        </ServingProvider>
      </ModelConfigsProvider>
    </QueryClientProvider>
  );
};
