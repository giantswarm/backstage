/**
 * Client for the muster MCP aggregator and the parsing of its auth tools,
 * shared by every backend plugin that calls muster on the user's behalf
 * (muster, plans, roadmap).
 */
export * from './MusterMcpClient';
export * from './musterInstallations';
export * from './authLogin';
export * from './serverGateway';
export * from './musterUnauthorized';
export * from './musterUnreachable';
export { MUSTER_CONNECT_TIMEOUT_MS } from './musterFetch';
export type { ConnectorName } from '@giantswarm/backstage-plugin-gs-common';
export {
  isMusterInputAnswer,
  type MusterInputAnswer,
  type MusterUrlElicitation,
} from '@giantswarm/backstage-plugin-gs-common';

/**
 * Header the Giant Swarm frontends use to forward the user's own token for a
 * muster installation's `authProvider` to the backend plugins that call
 * muster on the user's behalf (muster, plans, roadmap).
 */
export const MUSTER_AUTH_HEADER = 'backstage-muster-authorization';
