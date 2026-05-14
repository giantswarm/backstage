import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  GithubCredentialsProvider,
  ScmIntegrationRegistry,
} from '@backstage/integration';

/**
 * Resolves a GitHub token for the given URL with fallbacks:
 *
 * 1. `GithubCredentialsProvider` — typically a GitHub App installation token
 *    when an app is installed for the URL's owner.
 * 2. Integration `token` (PAT) — used when the credentials provider throws or
 *    returns no token. This covers the case where a GitHub App is installed
 *    for the owner but the requested repo is not part of the installation's
 *    selected repositories: Backstage's provider throws rather than falling
 *    back to the PAT itself.
 * 3. `undefined` — no token available (no integration configured, or PAT
 *    omitted). Caller should issue an unauthenticated request, which works
 *    for public repos at GitHub's anonymous rate limit (60/hr/IP).
 */
export async function resolveGithubToken(options: {
  url: string;
  credentialsProvider: GithubCredentialsProvider;
  integrations: ScmIntegrationRegistry;
  logger: LoggerService;
}): Promise<string | undefined> {
  const { url, credentialsProvider, integrations, logger } = options;

  try {
    const { token } = await credentialsProvider.getCredentials({ url });
    if (token) {
      return token;
    }
  } catch (error) {
    logger.debug(
      `GitHub credentials provider failed for ${url}, falling back to PAT: ${error}`,
    );
  }

  return integrations.github.byUrl(url)?.config.token;
}
