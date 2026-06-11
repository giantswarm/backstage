import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';

/**
 * Resolves the main auth API, or undefined when no main auth provider is
 * configured (`gs.authProvider` unset), in which case MCP servers require
 * dedicated auth providers.
 */
export function getOptionalMainAuthApi(
  gsAuthProvidersApi: typeof gsAuthProvidersApiRef.T,
) {
  try {
    return gsAuthProvidersApi.getMainAuthApi();
  } catch {
    return undefined;
  }
}
