import { RootConfigService } from '@backstage/backend-plugin-api';
import {
  GithubCredentials,
  GithubCredentialsProvider,
} from '@backstage/integration';

/**
 * The owners (GitHub organizations or users) the portal's GitHub credentials
 * may be used for when no `gs.github.allowedOwners` is configured.
 */
export const DEFAULT_ALLOWED_OWNERS: readonly string[] = ['giantswarm'];

/**
 * Reads `gs.github.allowedOwners`, falling back to
 * {@link DEFAULT_ALLOWED_OWNERS}. The single source of truth for the
 * allowlist — read once at startup, never per request.
 */
export function readAllowedOwners(
  config: RootConfigService,
): readonly string[] {
  return (
    config.getOptionalStringArray('gs.github.allowedOwners') ??
    DEFAULT_ALLOWED_OWNERS
  );
}

/**
 * A {@link GithubCredentialsProvider} that refuses to mint credentials for
 * repository owners outside an allowlist.
 *
 * Several gs-backend entry points hand caller-influenced GitHub URLs to the
 * credentials provider (the `/github/raw-content` proxy, `/agent-skills`
 * discovery, the `get-helm-chart-values` MCP action). The portal's GitHub
 * App — or worse, a PAT integration, which is valid for the whole host — can
 * read repositories the signed-in caller cannot, so an unguarded provider
 * lets any portal user read private content through those routes. Wrapping
 * the provider enforces the allowlist in one place for every current and
 * future caller.
 *
 * The owner is derived from the WHATWG-normalized URL (the form `fetch`
 * actually requests), so dot segments (`..`, `%2e%2e`) and backslashes cannot
 * smuggle a different owner past the check, and the delegate is called with
 * a canonical `<origin>/<owner>/<repo>` URL rebuilt from those normalized
 * parts, never with the raw input.
 *
 * A refusal throws, which every call site already treats as "no credentials
 * available" and falls back to an unauthenticated request — public content
 * stays reachable for any owner.
 */
export class AllowedOwnersGithubCredentialsProvider implements GithubCredentialsProvider {
  constructor(
    private readonly delegate: GithubCredentialsProvider,
    private readonly allowedOwners: readonly string[],
  ) {}

  async getCredentials(opts: { url: string }): Promise<GithubCredentials> {
    const parsed = new URL(opts.url);
    const [owner, repo] = parsed.pathname.split('/').filter(Boolean);
    if (!owner || !repo || !this.isAllowedOwner(owner)) {
      throw new Error(
        `Refusing GitHub credentials for ${parsed.origin}${parsed.pathname}: ` +
          `owner is not in gs.github.allowedOwners`,
      );
    }
    return this.delegate.getCredentials({
      ...opts,
      url: `${parsed.origin}/${owner}/${repo}`,
    });
  }

  // GitHub owner names are case-insensitive.
  private isAllowedOwner(owner: string): boolean {
    return this.allowedOwners.some(
      allowed => allowed.toLowerCase() === owner.toLowerCase(),
    );
  }
}
