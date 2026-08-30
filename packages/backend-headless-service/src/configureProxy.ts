/*
 * Must be imported before 'global-agent/bootstrap' (see index.ts).
 *
 * global-agent patches http(s).request so operators can route the backend's
 * egress through a corporate proxy (GLOBAL_AGENT_HTTP_PROXY). Its
 * forceGlobalAgent mode defaults to true, which replaces every request's
 * explicit `agent` with global-agent's own — discarding whatever that agent
 * carried. An @kubernetes/client-node client holds the cluster CA in its
 * agent, so against an API server without a publicly-signed certificate the
 * handshake then fails with "unable to verify the first certificate"
 * (scaffolder kube:apply was the first caller to hit this). Defaulting force
 * mode off makes global-agent leave explicit agents alone; agent-less
 * requests still get proxied, and setting the env var explicitly still opts
 * back in.
 */
process.env.GLOBAL_AGENT_FORCE_GLOBAL_AGENT ??= 'false';
