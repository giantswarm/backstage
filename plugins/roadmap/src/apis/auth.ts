import { createApiRef, OpenIdConnectApi } from '@backstage/core-plugin-api';

/** The caller's credential for the roadmap backend. */
export interface RoadmapAuthCredentials {
  /**
   * The user's muster token: the ID token of the main login provider (Dex),
   * which the roadmap backend forwards to muster. muster holds the person's
   * GitHub grant; the portal never sees a GitHub token.
   */
  token?: string;
}

/**
 * Where the roadmap frontend gets the caller's muster token. The app wires it
 * to the main login provider's session (same as the muster and plans
 * plugins); a deployment without a main OIDC login provides none, and the
 * roadmap backend then answers 401.
 */
export interface RoadmapAuthApi {
  getCredentials(): Promise<RoadmapAuthCredentials>;
}

export const roadmapAuthApiRef = createApiRef<RoadmapAuthApi>({
  id: 'plugin.roadmap.auth',
});

/** RoadmapAuthApi backed by the main login provider's ID token. */
export class RoadmapMainAuth implements RoadmapAuthApi {
  constructor(private readonly mainAuthApi?: OpenIdConnectApi) {}

  async getCredentials(): Promise<RoadmapAuthCredentials> {
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
