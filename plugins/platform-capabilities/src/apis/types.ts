/**
 * The shapes giantswarm-platform-manager's tools return, as the page shows
 * them. Nothing here is computed by the page; the names are the tools' own.
 */

/** The state of a capability on an installation, in the manager's words. */
export type CapabilityStateName =
  | 'not opted in'
  | 'not enabled'
  | 'pending approval'
  | 'rolling out'
  | 'waiting for the customer'
  | 'enabled'
  | 'drifted'
  | 'failed'
  | 'unknown';

/** The installation's opt-in file in its management-clusters repository. */
export interface OptIn {
  state: 'opted in' | 'not opted in' | 'unreadable';
  repository?: string;
  /** `management-clusters/<name>/platform-manager.yaml` */
  path?: string;
  present?: boolean;
  optIn?: boolean | null;
  /** How the owners opt in: the pull request that adds the file. */
  howToOptIn?: string;
  error?: string;
}

/** The installation's record: the definitions' `installation.*` inputs. */
export interface InstallationRecord {
  name: string;
  baseDomain?: string;
  customer?: string;
  provider?: string;
  private?: boolean;
  chartLine?: string;
  musterClientId?: string;
}

export interface ActionRef {
  name: string;
  result?: string;
}

export interface CapabilityState {
  name: string;
  state: CapabilityStateName;
  inputs?: { installation?: InstallationRecord };
  enabledMarker?: string;
  enabled?: boolean;
  lastAction?: ActionRef | null;
}

export interface Installation {
  name: string;
  customer?: string;
  provider?: string;
  pipeline?: string;
  region?: string;
  baseDomain?: string;
  accountEngineer?: string;
  authProvider?: string;
  hub?: boolean;
  repositories?: { configs?: string; managementClusters?: string };
  sources?: string[];
  record?: InstallationRecord;
  optIn: OptIn;
  capabilities: CapabilityState[];
  readable: boolean;
  errors?: string[];
}

export interface InstallationListing {
  caller?: unknown;
  hub?: string;
  capabilities: string[];
  installations: Installation[];
  unreadable?: string[];
}

export interface ListInstallationsFilters {
  installations?: string[];
  customer?: string;
}

/** A JSON schema as the manager publishes a definition's inputs. */
export interface JsonSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  default?: unknown;
  additionalProperties?: boolean | JsonSchema;
}

/** One observed aspect of a feature, as the definition declares it. */
export interface DefinitionDimension {
  id: string;
  /** configmap, dex-secret, extras, backstage, live, probe */
  kind?: string;
  key?: string;
}

/** One consistency feature of a definition: what `verify_capability` rolls its dimensions up into. */
export interface DefinitionFeature {
  id: string;
  title?: string;
  description?: string;
  dimensions?: DefinitionDimension[];
}

export interface Definition {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  features?: DefinitionFeature[];
}

export interface ManagerInfo {
  version: string;
  toolPrefix?: string;
  caller?: { login?: string } | null;
  capabilities?: { commit: boolean; modes: string[]; writeTools: string[] };
  definitions: Definition[];
  approvals?: { configured: boolean; channel?: string };
  registry?: { hub?: string; configured: boolean };
}

export interface ConnectionResponse {
  connected: boolean;
  authUrl?: string;
  message?: string;
}

export interface PlanFile {
  repository: string;
  path: string;
  change: 'create' | 'update' | 'unchanged' | 'unknown';
  content?: string;
  generated?: string[];
  error?: string;
}

/** A generated secret, by name only: no value ever leaves the manager. */
export interface GeneratedSecret {
  name: string;
  kind?: string;
  length?: number;
  files?: string[];
}

export interface DexClient {
  id: string;
  name?: string;
  public?: boolean;
  /** The reference to the client secret, never the secret. */
  secret?: string;
  redirectURIs?: string[];
  trustedPeers?: string[];
}

export interface CustomerAction {
  installation: string;
  action: string;
  why?: string;
}

export interface Probe {
  id: string;
  feature?: string;
  key?: string;
}

export interface PlanInstallation {
  name: string;
  state?: CapabilityStateName;
  optIn?: OptIn;
  inputs?: Record<string, unknown>;
  /** The definition's refusal of the inputs: an answer, not a fault. */
  refused?: string;
  /** Why a commit of this installation would be refused (not opted in). */
  commitRefused?: string;
  files?: PlanFile[];
  includes?: string[];
  generatedSecrets?: GeneratedSecret[];
  suppliedSecrets?: string[];
  dexClients?: DexClient[];
  customerActions?: CustomerAction[];
  probes?: Probe[];
  diff?: Record<string, number>;
}

export interface PlanPullRequest {
  order: number;
  repository: string;
  installations?: string[];
  files?: string[];
  changes?: number;
  generatedSecrets?: string[];
}

export interface SkippedInstallation {
  name: string;
  reason: string;
  optIn?: OptIn;
  errors?: string[];
}

export interface CapabilityPlan {
  tool: string;
  capability: string;
  hub?: string;
  dryRun: true;
  order?: string[];
  installations: PlanInstallation[];
  pullRequests?: PlanPullRequest[];
  skipped?: SkippedInstallation[];
  /** What a commit does, in the manager's words. */
  commit?: string;
}

export interface ActionPullRequest {
  repository: string;
  number?: number;
  url?: string;
  state?: string;
}

export interface ActionApproval {
  channel?: string;
  reviewId?: string;
  decision?: string;
  decidedBy?: string;
  reason?: string;
  at?: string;
  /** The approval thread, where the manager records one. */
  url?: string;
}

/** An Action record, as the manager keeps it. */
export interface Action {
  name: string;
  namespace?: string;
  createdAt?: string;
  spec: {
    actor?: { login?: string; id?: number };
    capability: string;
    kind: 'enable' | 'reconcile';
    installations: string[];
    inputs?: Record<string, unknown>;
  };
  status?: {
    state?: CapabilityStateName;
    pullRequests?: ActionPullRequest[];
    approval?: ActionApproval;
    rollout?: {
      startedAt?: string;
      finishedAt?: string;
      installations?: { name: string; state?: string; message?: string }[];
    };
    result?: { state?: string; message?: string; at?: string };
  };
}

export interface ActionListing {
  namespace?: string;
  actions: Action[];
}

/** The answer to `mode: commit`: the Action the manager started. */
export interface Committed {
  action: Action;
  message?: string;
}

export type VerifyMark =
  'as defined' | 'differs by input' | 'drifted' | 'not checked';

export interface VerifyDifference {
  file?: string;
  path?: string;
  input?: string;
  rendered?: unknown;
  current?: unknown;
}

export interface VerifyDimension {
  id: string;
  kind?: string;
  key?: string;
  mark: VerifyMark;
  reason?: string;
  files?: string[];
  differences?: VerifyDifference[];
  probe?: {
    expect?: number[];
    requests?: { url: string; status?: number; error?: string; ok: boolean }[];
  };
}

export interface VerifyFeature {
  id: string;
  title?: string;
  mark: VerifyMark;
  marks?: Partial<Record<VerifyMark, number>>;
  dimensions?: VerifyDimension[];
}

export interface VerifyResult {
  installation: string;
  capability: string;
  state?: CapabilityStateName;
  inputs?: { source: string; values?: Record<string, unknown> };
  refused?: string;
  features: VerifyFeature[];
  summary?: Partial<Record<VerifyMark, number>>;
}

export type WriteOptions = { dryRun: true } | { mode: 'commit' };

export type WriteResult<O extends WriteOptions> = O extends { dryRun: true }
  ? CapabilityPlan
  : Committed;

export interface CapabilityWriteArgs {
  /** The definition's typed inputs; `installation.*` overrides the record. */
  inputs?: Record<string, unknown>;
  /** false: paths and changes only, no file content. */
  content?: boolean;
}

export interface PlatformCapabilitiesApi {
  getConnection(): Promise<ConnectionResponse>;
  getInfo(): Promise<ManagerInfo>;
  listInstallations(
    filters?: ListInstallationsFilters,
  ): Promise<InstallationListing>;
  enableCapability<O extends WriteOptions>(
    installation: string,
    capability: string,
    args: CapabilityWriteArgs,
    options: O,
  ): Promise<WriteResult<O>>;
  reconcileCapability<O extends WriteOptions>(
    installation: string,
    capability: string,
    args: CapabilityWriteArgs,
    options: O,
  ): Promise<WriteResult<O>>;
  verifyCapability(
    installation: string,
    capability: string,
  ): Promise<VerifyResult>;
  listActions(filter: {
    installation?: string;
    capability?: string;
  }): Promise<ActionListing>;
  getAction(name: string): Promise<Action>;
}
