/**
 * The two portals one deployment can serve, switched by app-config
 * (`app.portals`, documented in the app's `config.d.ts`):
 *
 * - **Platform Portal** — the classic portal (clusters, catalog, deployments,
 *   …) in its classic chrome.
 * - **Agent Platform** — the agent shell on the agent area's routes (`/`,
 *   `/agent-platform/**`, `/customize/**`).
 *
 * Both on: each in its own chrome, chosen by URL, with a cross-link to the
 * other (opening a new tab). One on: it is the whole navigation and no
 * cross-link points at the other.
 */
export type Portals = {
  /** The classic Platform Portal and its chrome. */
  platformPortal: boolean;
  /** The Agent Platform shell on the agent area's routes. */
  agentPlatform: boolean;
};

/**
 * The slice of a Backstage `Config` reader this module needs, so it works
 * against the frontend's `configApi` and a backend `RootConfigService` alike
 * without depending on either package.
 */
export interface PortalsConfigReader {
  getOptionalBoolean(key: string): boolean | undefined;
}

/** Whether the deployment switched the Agent Platform on (default: off). */
function agentPlatformConfigured(
  config: PortalsConfigReader | undefined,
): boolean {
  return config?.getOptionalBoolean('app.portals.agentPlatform') ?? false;
}

/**
 * Whether the per-person `agent-platform-shell` feature flag means anything:
 * it opts one browser into the Agent Platform only while the deployment has
 * it switched off (and so the Platform Portal on). Once the deployment
 * switches it on, the flag is moot and not offered.
 */
export function isAgentShellOptInOffered(
  config: PortalsConfigReader | undefined,
): boolean {
  return !agentPlatformConfigured(config);
}

/**
 * Which portals this deployment serves to this person.
 *
 * `app.portals.platformPortal` defaults to on and `app.portals.agentPlatform`
 * to off, so a deployment that sets neither stays exactly the classic portal.
 * Switching both off is read as the default rather than as "no portal at
 * all". `agentShellOptIn` is the person's `agent-platform-shell` flag: it
 * adds the Agent Platform next to the Platform Portal while the deployment
 * has it off (see {@link isAgentShellOptInOffered}).
 *
 * Idempotent in the opt-in: feeding the result's `agentPlatform` back in as
 * `agentShellOptIn` yields the same result, so a caller may pass the flag as
 * the app's config-aware FeatureFlagsApi already reports it.
 */
export function readPortals(
  config: PortalsConfigReader | undefined,
  { agentShellOptIn = false }: { agentShellOptIn?: boolean } = {},
): Portals {
  const agentPlatform = agentPlatformConfigured(config);
  const platformPortal =
    config?.getOptionalBoolean('app.portals.platformPortal') ?? true;
  return {
    platformPortal: platformPortal || !agentPlatform,
    agentPlatform: agentPlatform || agentShellOptIn,
  };
}
