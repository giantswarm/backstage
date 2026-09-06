// The governance view of one installation's inventory: how its MCP servers
// and workflows are managed (GitOps vs registered live) and how their users
// authenticate. All of it is read from the CRDs, so it needs no muster
// session -- the dashboard renders it whenever the server list has loaded.

import { MCPServer, MusterWorkflow } from './k8s';
import { isGitOpsManaged } from './gitops';

/**
 * How users reach a server, read from `spec.auth`. The four modes the
 * registration wizard offers (see mcpServerDefinition.ts) plus cross-cluster
 * token exchange, which the wizard does not offer but the federated fleet
 * uses to bridge SSO into remote management clusters.
 */
export type ServerAuthMode =
  'platform-sso' | 'token-exchange' | 'own-account' | 'sigv4' | 'anonymous';

export const AUTH_MODE_LABELS: Record<ServerAuthMode, string> = {
  'platform-sso': 'Platform SSO (forwarded token)',
  'token-exchange': 'Token exchange (cross-cluster SSO)',
  'own-account': 'Own account (OAuth sign-in)',
  sigv4: 'AWS SigV4 (machine identity)',
  anonymous: 'Anonymous',
};

/** Display order: the identity-preserving modes first, the shared one last. */
export const AUTH_MODE_ORDER: ServerAuthMode[] = [
  'platform-sso',
  'token-exchange',
  'own-account',
  'sigv4',
  'anonymous',
];

/**
 * Classify one server's auth chain. Token exchange is checked before the
 * forwarded token because a token-exchange server also forwards (the exchanged)
 * token; sigv4 first because the CRD forbids combining it with anything else.
 */
export function serverAuthMode(server: MCPServer): ServerAuthMode {
  const auth = server.getAuth();
  if (!auth) {
    return 'anonymous';
  }
  if (auth.type === 'sigv4') {
    return 'sigv4';
  }
  if (auth.tokenExchange?.enabled) {
    return 'token-exchange';
  }
  if (auth.forwardToken) {
    return 'platform-sso';
  }
  if (auth.type === 'oauth') {
    return 'own-account';
  }
  return 'anonymous';
}

export type AuthPostureEntry = {
  mode: ServerAuthMode;
  label: string;
  count: number;
};

/** Servers per auth mode in display order; modes nobody uses are dropped. */
export function authPosture(servers: MCPServer[]): AuthPostureEntry[] {
  const counts = new Map<ServerAuthMode, number>();
  for (const server of servers) {
    const mode = serverAuthMode(server);
    counts.set(mode, (counts.get(mode) ?? 0) + 1);
  }
  return AUTH_MODE_ORDER.filter(mode => counts.has(mode)).map(mode => ({
    mode,
    label: AUTH_MODE_LABELS[mode],
    count: counts.get(mode) ?? 0,
  }));
}

export type ServerProvenanceSummary = {
  total: number;
  /** Flux/Helm-managed: read-only in the app, changed via a PR. */
  gitops: number;
  /** Registered live through muster: editable in place. */
  adHoc: number;
  /** `spec.suspended`: deliberately kept disconnected. */
  suspended: number;
};

export function serverProvenance(
  servers: MCPServer[],
): ServerProvenanceSummary {
  let gitops = 0;
  let suspended = 0;
  for (const server of servers) {
    if (isGitOpsManaged(server)) {
      gitops += 1;
    }
    if (server.getSuspended()) {
      suspended += 1;
    }
  }
  return {
    total: servers.length,
    gitops,
    adHoc: servers.length - gitops,
    suspended,
  };
}

export type WorkflowSummary = {
  total: number;
  gitops: number;
  adHoc: number;
  /**
   * Workflows muster's validator flagged. A quality signal, not a runnability
   * one (ADR muster-ui-iteration-2, D2): every loaded workflow still runs.
   */
  validationWarnings: number;
};

export function workflowSummary(workflows: MusterWorkflow[]): WorkflowSummary {
  let gitops = 0;
  let validationWarnings = 0;
  for (const workflow of workflows) {
    if (isGitOpsManaged(workflow)) {
      gitops += 1;
    }
    if (workflow.hasValidationWarning()) {
      validationWarnings += 1;
    }
  }
  return {
    total: workflows.length,
    gitops,
    adHoc: workflows.length - gitops,
    validationWarnings,
  };
}
