import { createApiRef, OpenIdConnectApi } from '@backstage/core-plugin-api';

/** The caller's credential for the plans backend. */
export interface PlansAuthCredentials {
  /**
   * The user's muster token: the ID token of the main login provider (Dex),
   * which the plans backend forwards to muster. muster holds the person's
   * GitHub grant; the portal never sees a GitHub token.
   */
  token?: string;
}

/**
 * Where the plans frontend gets the caller's muster token. The app wires it
 * to the main login provider's session (same as the muster plugin's auth
 * providers); a deployment without a main OIDC login provides none, and the
 * plans backend then answers 401.
 */
export interface PlansAuthApi {
  getCredentials(): Promise<PlansAuthCredentials>;
}

export const plansAuthApiRef = createApiRef<PlansAuthApi>({
  id: 'plugin.plans.auth',
});

/**
 * PlansAuthApi backed by the main login provider's ID token (single sign-on:
 * no separate login, the Dex session the user already has).
 */
export class PlansMainAuth implements PlansAuthApi {
  constructor(private readonly mainAuthApi?: OpenIdConnectApi) {}

  async getCredentials(): Promise<PlansAuthCredentials> {
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
