import { defaultShouldDehydrateQuery, Query } from '@tanstack/react-query';

/**
 * Marks a query as unsafe to persist, for `shouldPersistQuery` below.
 *
 * Spread into a query's `meta`. Use it for anything whose answer is tied to the
 * signed-in identity or to a permission grant: the persisted cache outlives the
 * session (nothing calls `persister.removeClient()`, including on sign-out), so a
 * rehydrated answer can belong to a *different* user on a shared browser, or to a
 * grant that has since been revoked.
 */
export const NON_PERSISTED_QUERY_META = { persist: false } as const;

/**
 * Pass as `dehydrateOptions.shouldDehydrateQuery` in the plugin
 * QueryClientProviders that wrap `PersistQueryClientProvider`.
 *
 * Keeps the library default (only successful queries are written out) and
 * additionally drops anything tagged with {@link NON_PERSISTED_QUERY_META}.
 *
 * Named for the question it answers rather than after the react-query option, so
 * a provider can compose it with plugin-specific rules without the two shadowing
 * each other — see the agent-platform provider, which additionally filters
 * user-scoped query keys.
 */
export function shouldPersistQuery(query: Query): boolean {
  return defaultShouldDehydrateQuery(query) && query.meta?.persist !== false;
}
