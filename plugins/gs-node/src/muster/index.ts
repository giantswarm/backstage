/**
 * Client for the muster MCP aggregator and the parsing of its auth tools,
 * shared by every backend plugin that calls muster on the user's behalf
 * (muster, plans, roadmap).
 */
export * from './MusterMcpClient';
export * from './authLogin';

/**
 * Header the Giant Swarm frontends use to forward the user's own token for a
 * muster installation's `authProvider` to the backend plugins that call
 * muster on the user's behalf (muster, plans, roadmap).
 */
export const MUSTER_AUTH_HEADER = 'backstage-muster-authorization';
