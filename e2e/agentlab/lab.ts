/**
 * The agentlab the suite runs against: `giantswarm/agentlab`'s defaults, each
 * overridable through the environment for a lab configured differently.
 *
 * The users are the lab's **fixtures** — throwaway accounts of a
 * static-password Dex connector on a kind cluster on the developer's machine,
 * listed in clear text in the lab's `agentlab.yaml`. Signing in as them is
 * what this suite is for; they are nobody's credentials.
 */

export interface LabUser {
  /** The Dex login (the lab's static-password connector keys on the email). */
  email: string;
  /** The display name the portal shows for the signed-in user. */
  name: string;
}

/** The lab's kind cluster: `clusterName` in its `agentlab.yaml`. */
const cluster = process.env.AGENTLAB_CLUSTER ?? 'agentlab';

/**
 * Which portals the lab's Backstage serves, as `AGENTLAB_PORTAL_MODE` says:
 *
 * - `classic` (the default): `app.portals.agentPlatform` off, the chart's
 *   default. Exactly the classic Platform Portal, with nothing of the Agent
 *   Platform in it — no sidebar item, no `/agent-platform/**` route.
 * - `shell`: the lab's Backstage runs with
 *   `APP_CONFIG_app_portals_agentPlatform=true` (both portals on). The Agent
 *   Platform is the agent shell on `/`, `/agent-platform/**` and
 *   `/customize/**`; the classic portal everywhere else, its sidebar linking
 *   into the shell.
 *
 * The switch is the deployment's, so one lab is in one mode at a time: the
 * `agentlab` project (the classic portal's specs) runs in either, the
 * `agentlab-shell` project (the Agent Platform's) only in `shell` — see
 * `playwright.config.ts` and `portalModes.ts`.
 */
export type PortalMode = 'classic' | 'shell';

function portalModeFromEnv(): PortalMode {
  const mode = process.env.AGENTLAB_PORTAL_MODE ?? 'classic';
  if (mode !== 'classic' && mode !== 'shell') {
    throw new Error(
      `AGENTLAB_PORTAL_MODE must be "classic" or "shell", not "${mode}"`,
    );
  }
  return mode;
}

export const lab = {
  /** Backstage's public URL through the lab's edge. */
  baseURL:
    process.env.AGENTLAB_BACKSTAGE_URL ?? 'https://backstage.127.0.0.1.nip.io',
  /** The fixture password, the same for every lab user. */
  password: process.env.AGENTLAB_PASSWORD ?? 'password',
  /** Which portals the lab serves (`AGENTLAB_PORTAL_MODE`, see {@link PortalMode}). */
  portalMode: portalModeFromEnv(),
  /**
   * The installation name the portal's plugins address — the Helm release
   * name of the platform chart in the lab, not the kind cluster's name.
   */
  installation: process.env.AGENTLAB_INSTALLATION ?? 'agent-platform',
  /**
   * The MCPServer the lab registers for its own cluster: the `kubernetes`
   * family member `<cluster>-mcp-kubernetes`, the way every management
   * cluster registers itself (`agentlab-2-mcp-kubernetes` on a lab whose
   * `clusterName` is `agentlab-2`).
   */
  mcpKubernetes: `${cluster}-mcp-kubernetes`,
  /** The lab's kind node, the one the platform's workloads run on. */
  kindNode: process.env.AGENTLAB_KIND_NODE ?? `${cluster}-control-plane`,
  /**
   * The lab's Ollama as model-manager reaches it from the kind node: the
   * host on the kind docker network (`docker network inspect kind`, the
   * IPAM gateway), where agentlab points the platform's Ollama backend.
   */
  ollamaEndpoint:
    process.env.AGENTLAB_OLLAMA_ENDPOINT ?? 'http://172.21.0.1:11434',
  users: {
    /** `platform-admins` + `developers`: may create agents and read kagent. */
    admin: { email: 'admin@lab.local', name: 'Lab Admin' },
    /** `developers`: edit in the demo namespace, no kagent reads. */
    dev: { email: 'dev@lab.local', name: 'Lab Developer' },
    /** `viewers`: view only. */
    viewer: { email: 'viewer@lab.local', name: 'Lab Viewer' },
  } satisfies Record<string, LabUser>,
} as const;

/**
 * Options for every browser context the suite opens — in the config's `use`
 * and, spelled out again, in the fixtures that open contexts of their own
 * (a context opened from the `browser` fixture inherits nothing).
 *
 * `ignoreHTTPSErrors`: the edge and Dex serve certificates signed by the lab
 * CA. Trusting it in the test browser would need `agentlab trust`; ignoring
 * TLS errors keeps the suite runnable on a fresh checkout.
 */
export const contextOptions = {
  baseURL: lab.baseURL,
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
} as const;
