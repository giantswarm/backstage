import { ReactNode } from 'react';
import { QueryClient, QueryClientConfig } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import {
  createPluginQueryPersister,
  shouldPersistQuery,
} from '@giantswarm/backstage-plugin-kubernetes-react';

const gcTime = 1000 * 60 * 60;
const maxAge = gcTime;

const queryOptions: QueryClientConfig = {
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: (failureCount, error) => {
        const name = (error as Error).name;

        if (
          name === 'RejectedError' ||
          name === 'NotFoundError' ||
          name === 'UnauthorizedError' ||
          name === 'ForbiddenError'
        ) {
          return false;
        }

        if (failureCount > 2) {
          return false;
        }

        return true;
      },
      gcTime,
    },
  },
};

// Module-level client so all mounts (e.g. the flux list and tree sub-pages)
// share one live QueryClient instead of re-hydrating from the persister on
// every mount.
const queryClient = new QueryClient(queryOptions);

/**
 * This plugin's own localStorage key. The gs, flux and agent-platform providers
 * used to share the library default and so merged their caches into one blob
 * (see `LEGACY_SHARED_PERSISTER_KEY` in kubernetes-react); each now has its own,
 * with a size guard. Flux is the one that needs it: the Kustomization lists of
 * a large fleet measured 3.6 MB on the Dev Portal, so the persisted copy keeps
 * the most recently read installations and drops the oldest beyond the budget.
 * A change to what a query stores still calls for a new *query* key, not a new
 * persister key: the blob under this one outlives releases.
 */
export const FLUX_PERSISTER_KEY = 'flux-react-query-cache';

const persister = createPluginQueryPersister({ key: FLUX_PERSISTER_KEY });

export const QueryClientProvider = ({ children }: { children: ReactNode }) => {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge,
        // Keeps the library default (successful queries only) and additionally
        // drops anything tagged NON_PERSISTED_QUERY_META, e.g. permission probes
        // whose answer is tied to the signed-in identity.
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
