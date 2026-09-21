/**
 * The shapes giantswarm-platform-manager's tools return, as the page shows
 * them. Nothing here is computed by the page; the names are the tools' own.
 */

/** The state of a capability on an installation, in the manager's words. */
export type CapabilityStateName =
  | 'not opted in'
  | 'enabled, not opted in'
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
  /** The capability's fileset is on record, whoever put it there. */
  enabled?: boolean;
  /** The owners have declared the opt-in: the manager may write here. */
  optedIn?: boolean;
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
  /**
   * The states and the last actions alone, without the record, the inputs
   * on record, the portals and the federation facts: a third of the
   * manager's reads, for an overview. The default answer carries them all.
   */
  summary?: boolean;
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
  /** Where a value comes from: `registry` (read), `generated`, `person` (a choice). */
  'x-source'?: string;
}

export interface Definition {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
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
  /** The file as the plan writes it; only when the content was asked for. */
  content?: string;
  /**
   * The file on record as the caller reads it, an encrypted file with every
   * secret leaf reading `<encrypted>`; absent when the record lacks the file
   * or the content was not asked for.
   */
  current?: string;
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

/** The plan of one installation: what a dry run's entry and the comparison both carry. */
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
  includes?: unknown[];
  generatedSecrets?: GeneratedSecret[];
  suppliedSecrets?: string[];
  dexClients?: DexClient[];
  customerActions?: CustomerAction[];
  probes?: Probe[];
  /** Files by change: `create`, `update`, `unchanged`, … */
  diff?: Record<string, number>;
  features?: VerifyFeature[];
  summary?: Partial<Record<VerifyMark, number>>;
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
  'as defined' | 'differs by input' | 'drifted' | 'planned' | 'not checked';

export interface VerifyDifference {
  file?: string;
  object?: string;
  path?: string;
  input?: string;
  /** Why the change is planned rather than drift: the migration that carries it. */
  planned?: string;
  rendered?: unknown;
  current?: unknown;
  /** 1-based line of the leaf in the file's `content`; absent when the render lacks it. */
  line?: number;
  /** 1-based line of the leaf in the file's `current`; absent when the record lacks it. */
  currentLine?: number;
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

/** Where the comparison's inputs came from: the record, the files read back, the person's typed values. */
export interface VerifyInputs {
  source: string;
  values?: Record<string, unknown>;
  readBack?: Record<string, unknown>;
}

/**
 * `verify_capability`'s answer: the one comparison of an installation with
 * its definition -- the features with their marks and the plan the same
 * inputs render (files, pull requests, generated secrets, Dex clients,
 * customer actions), so the dry run and the check are one call.
 */
export interface VerifyResult extends Omit<
  PlanInstallation,
  'name' | 'inputs'
> {
  caller?: string;
  installation: string;
  capability: string;
  hub?: string;
  liveCaller?: string;
  inputs?: VerifyInputs;
  features: VerifyFeature[];
  pullRequests?: PlanPullRequest[];
}

export type WriteOptions = { dryRun: true } | { mode: 'commit' };

export type WriteResult<O extends WriteOptions> = O extends { dryRun: true }
  ? CapabilityPlan
  : Committed;

/** What enable, reconcile and verify take besides the names. */
export interface CapabilityArgs {
  /** The definition's typed inputs; `installation.*` overrides the record. */
  inputs?: Record<string, unknown>;
  /** true: the files' content as well as their paths and changes. */
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
    args: CapabilityArgs,
    options: O,
  ): Promise<WriteResult<O>>;
  reconcileCapability<O extends WriteOptions>(
    installation: string,
    capability: string,
    args: CapabilityArgs,
    options: O,
  ): Promise<WriteResult<O>>;
  verifyCapability(
    installation: string,
    capability: string,
    args?: CapabilityArgs,
  ): Promise<VerifyResult>;
  listActions(filter: {
    installation?: string;
    capability?: string;
  }): Promise<ActionListing>;
  getAction(name: string): Promise<Action>;
}
