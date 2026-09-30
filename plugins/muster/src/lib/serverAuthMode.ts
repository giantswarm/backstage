import { MCPServer } from './k8s';

/**
 * How users reach a server, read from `spec.auth`. The four modes the
 * registration wizard offers (see mcpServerDefinition.ts) plus cross-cluster
 * token exchange, which the wizard does not offer but the federated fleet
 * uses to bridge SSO into remote management clusters. `unknown` is an auth
 * `type` this frontend does not know, which must not read as no auth at all.
 */
export type ServerAuthMode =
  | 'platform-sso'
  | 'token-exchange'
  | 'own-account'
  | 'sigv4'
  | 'anonymous'
  | 'unknown';

export const AUTH_MODE_LABELS: Record<ServerAuthMode, string> = {
  'platform-sso': 'Platform SSO (forwarded token)',
  'token-exchange': 'Token exchange (cross-cluster SSO)',
  'own-account': 'Own account (OAuth sign-in)',
  sigv4: 'AWS SigV4 (machine identity)',
  anonymous: 'Anonymous',
  unknown: 'Unrecognised authentication',
};

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
  if (auth.type === undefined || auth.type === 'none') {
    return 'anonymous';
  }
  return 'unknown';
}
