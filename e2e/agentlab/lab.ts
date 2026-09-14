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

export const lab = {
  /** Backstage's public URL through the lab's edge. */
  baseURL:
    process.env.AGENTLAB_BACKSTAGE_URL ?? 'https://backstage.127.0.0.1.nip.io',
  /** The fixture password, the same for every lab user. */
  password: process.env.AGENTLAB_PASSWORD ?? 'password',
  /**
   * The installation name the portal's plugins address — the Helm release
   * name of the platform chart in the lab, not the kind cluster's name.
   */
  installation: process.env.AGENTLAB_INSTALLATION ?? 'agent-platform',
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
