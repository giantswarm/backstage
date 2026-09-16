import { createApiRef, OpenIdConnectApi } from '@backstage/core-plugin-api';

/** The caller's credential for the repositories backend. */
export interface RepositoriesAuthCredentials {
  /**
   * The user's muster token: the ID token of the main login provider (Dex),
   * which the backend forwards to muster and muster to the manager. The
   * manager obtains the person's GitHub grant from muster's token broker;
   * the portal never sees a GitHub token.
   */
  token?: string;
}

/**
 * Where the repositories frontend gets the caller's muster token. The app
 * wires it to the main login provider's session (the same as the muster and
 * plans plugins); a deployment without a main OIDC login provides none, and
 * the backend then answers 401.
 */
export interface RepositoriesAuthApi {
  getCredentials(): Promise<RepositoriesAuthCredentials>;
}

export const repositoriesAuthApiRef = createApiRef<RepositoriesAuthApi>({
  id: 'plugin.repositories.auth',
});

/** RepositoriesAuthApi backed by the main login provider's ID token. */
export class RepositoriesMainAuth implements RepositoriesAuthApi {
  constructor(private readonly mainAuthApi?: OpenIdConnectApi) {}

  async getCredentials(): Promise<RepositoriesAuthCredentials> {
    if (!this.mainAuthApi) {
      return {};
    }
    try {
      return { token: await this.mainAuthApi.getIdToken() };
    } catch {
      return {};
    }
  }
}
