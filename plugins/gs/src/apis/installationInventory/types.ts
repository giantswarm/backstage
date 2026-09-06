import type { ClusterAccessState } from '../clusterAccessStatus';

/**
 * The Agent Platform components an installation can run, as far as the
 * Kubernetes API can tell. Each registers an API group on the management
 * cluster, so its presence in `GET /apis` (the `APIGroupList`, served to every
 * authenticated caller by the `system:discovery` role) says whether the
 * component is installed there. model-manager and cluster-manager register no
 * API group; the backend's explicit allowlists stay authoritative for those.
 */
export type PlatformComponent = 'kagent' | 'muster' | 'kserve' | 'capi';

export const PLATFORM_API_GROUPS: Record<PlatformComponent, string> = {
  kagent: 'kagent.dev',
  muster: 'muster.giantswarm.io',
  kserve: 'serving.kserve.io',
  capi: 'cluster.x-k8s.io',
};

export const PLATFORM_COMPONENTS = Object.keys(
  PLATFORM_API_GROUPS,
) as PlatformComponent[];

/** Which components an installation runs: the answer of one `/apis` probe. */
export type PlatformComponents = Record<PlatformComponent, boolean>;

/**
 * Where one installation's probe stands. `pending` covers both "not asked
 * yet" (access not healthy) and "asked, no answer yet".
 */
export type InstallationProbeState = 'pending' | 'answered' | 'failed';

export type InstallationInventoryEntry = {
  installation: string;
  /**
   * The entry whose `oidcTokenProvider` is the frontend's main sign-in
   * provider (`gs.authProvider`): the portal's own management cluster on the
   * central Dev Portal, the release itself on a standalone install.
   */
  home: boolean;
  pipeline?: string;
  /** The cluster-access state; `unknown` while absent from the status set. */
  accessState: ClusterAccessState | 'unknown';
  /** One `GET /apis` per installation. */
  probe: InstallationProbeState;
  /** All false until `probe === 'answered'`. */
  components: PlatformComponents;
  error?: Error;
};

export type InstallationInventory = {
  /** Home first, then in the order the access probes settled. */
  entries: InstallationInventoryEntry[];
  home: string | undefined;
  /**
   * The installations config has not loaded, or the home installation has not
   * answered yet (while it still can).
   */
  isLoading: boolean;
  /** Some entry that can still answer has not. */
  isProbing: boolean;
  /**
   * Installations that answered, run the component and are `healthy` --
   * home first. What a tab may query for that component.
   */
  installationsWith: (component: PlatformComponent) => string[];
  /** Drops every cached answer and re-probes the healthy installations. */
  refresh: () => void;
};
