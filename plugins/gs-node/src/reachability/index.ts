/**
 * Unauthenticated endpoint reachability: the probe and its per-URL cache,
 * shared by the backend plugins that proxy an installation's component
 * (muster-backend, agent-platform-backend). The probe carries no credentials
 * and no user data; it only tells whether a route exists from where the
 * portal runs. See probeEndpoint.ts for the classification.
 */
export * from './probeEndpoint';
export * from './ReachabilityCache';
