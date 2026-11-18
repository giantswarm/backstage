import type { ReactNode } from 'react';
import { BUIProvider } from '@backstage/ui';
import {
  RoutingProvider,
  useRoutingIntegration,
  type RoutingIntegration,
} from '@backstage/frontend-plugin-api/routing';
import { resolvePath, useLocation, useNavigate } from 'react-router-dom';

function useReactRouterIntegration(): RoutingIntegration {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const createHref = (to: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(to)) {
      return to;
    }
    const target = resolvePath(to, pathname);
    return `${target.pathname}${target.search}${target.hash}`;
  };
  return {
    createHref,
    navigate: (to, options) => navigate(createHref(to), options),
    pathname,
  };
}

/**
 * The app's routing for bui, on the React Router of a test that renders
 * outside a test app (`MemoryRouter`): bui's links and tabs navigate through
 * the routing integration and follow its location, as in the app, where
 * `BUIProvider` gets `useRoutingIntegration` too. Place it inside the router.
 */
export function BUIRouterProvider({ children }: { children: ReactNode }) {
  return (
    <RoutingProvider useRoutingIntegration={useReactRouterIntegration}>
      <BUIProvider useNavigation={useRoutingIntegration}>
        {children}
      </BUIProvider>
    </RoutingProvider>
  );
}
