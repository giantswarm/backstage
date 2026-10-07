import { configApiRef } from '@backstage/core-plugin-api';
import type { ApiHolder } from '@backstage/frontend-plugin-api';
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';

/**
 * Whether the portal has a GitHub login behind `githubAuthApiRef` (the app's
 * `github-auth` API): the person's GitHub grant in muster (`gs.github`) or
 * Backstage's own GitHub provider (`auth.providers.github`, public config).
 *
 * Without either, the API falls back to the upstream provider, whose sign-in
 * popup asks the auth backend for a provider it does not have and fails every
 * time. The views that read GitHub as the signed-in person (the GitHub Actions
 * and Pull Requests tabs) are therefore offered only where this holds.
 */
export function hasGithubLogin(apis: ApiHolder): boolean {
  return Boolean(
    apis.get(gsAuthProvidersApiRef)?.hasGithubAuthApi() ||
    apis.get(configApiRef)?.has('auth.providers.github'),
  );
}
