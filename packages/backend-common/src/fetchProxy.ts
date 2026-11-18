import {
  EnvHttpProxyAgent,
  setGlobalDispatcher,
  type Dispatcher,
} from 'undici';

/**
 * The dispatcher that routes Node's native `fetch` through the proxy an
 * operator configured with `GLOBAL_AGENT_HTTP_PROXY` (and optionally
 * `GLOBAL_AGENT_HTTPS_PROXY` / `GLOBAL_AGENT_NO_PROXY`), or `undefined` when
 * no proxy is configured.
 *
 * global-agent only patches the `http`/`https` modules; native `fetch`
 * (undici) never sees it, so catalog, scaffolder and every other `fetch`
 * caller would go direct and fail behind an egress proxy. The same variables
 * drive both, with global-agent's semantics: the HTTP proxy also serves HTTPS
 * unless an HTTPS proxy is set, and only `GLOBAL_AGENT_NO_PROXY` exempts
 * hosts. undici reads a bare `example.com` entry as the domain and its
 * subdomains, and `*.example.com` or `.example.com` as the subdomains.
 *
 * `NODE_USE_ENV_PROXY=1` hands the proxy to Node itself (`HTTP_PROXY`,
 * `HTTPS_PROXY`, `NO_PROXY`), and this function returns `undefined` then. That
 * does not keep Node's proxy dispatcher by itself: see
 * {@link assertEnvProxySupported}.
 */
export function fetchProxyDispatcher(
  env: NodeJS.ProcessEnv,
): Dispatcher | undefined {
  const httpProxy = env.GLOBAL_AGENT_HTTP_PROXY || undefined;
  const httpsProxy = env.GLOBAL_AGENT_HTTPS_PROXY || httpProxy;
  if (!httpsProxy || env.NODE_USE_ENV_PROXY === '1') {
    return undefined;
  }
  return new EnvHttpProxyAgent({
    httpProxy,
    httpsProxy,
    // An explicit value, so a cluster-injected NO_PROXY never applies.
    noProxy: env.GLOBAL_AGENT_NO_PROXY ?? '',
  });
}

/** The Node release whose bundled undici (7.28) keeps `NODE_USE_ENV_PROXY`. */
export const MIN_NODE_FOR_ENV_PROXY = '24.17.0';

/** The fields of `process.versions` the check reads. */
type NodeVersions = { node: string; undici?: string };

/**
 * Throws when `NODE_USE_ENV_PROXY=1` is set on a Node whose native `fetch`
 * would bypass that proxy.
 *
 * Node installs its proxy dispatcher in the slot of its bundled undici. An
 * undici older than 7.27 fills only `undici.globalDispatcher.1`; the first
 * import of undici 8 (this module's, or any dependency's) finds
 * `undici.globalDispatcher.2` empty and installs a plain `Agent` over both
 * slots, so `fetch` goes direct while `http`/`https` keep the proxy. Node
 * 24.17 bundles undici 7.28; Node 22 and every Node 25 bundle an older one.
 * The check reads the bundled undici, not the Node version, for that reason.
 */
export function assertEnvProxySupported(
  env: NodeJS.ProcessEnv,
  versions: NodeVersions = process.versions,
) {
  if (env.NODE_USE_ENV_PROXY !== '1') {
    return;
  }
  const [major, minor] = (versions.undici ?? '0.0').split('.').map(Number);
  if (major > 7 || (major === 7 && minor >= 27)) {
    return;
  }
  throw new Error(
    `NODE_USE_ENV_PROXY=1 needs Node ${MIN_NODE_FOR_ENV_PROXY} or later ` +
      `(Node 25 does not qualify). This is Node ${versions.node}, whose ` +
      `bundled undici ${versions.undici ?? '(unknown)'} lets native fetch ` +
      `bypass the proxy. Upgrade Node, or set GLOBAL_AGENT_HTTP_PROXY ` +
      `instead of NODE_USE_ENV_PROXY.`,
  );
}

/**
 * Installs {@link fetchProxyDispatcher} as the global dispatcher of native
 * `fetch`, after {@link assertEnvProxySupported}. Call once, before the
 * backend starts.
 */
export function configureFetchProxy(
  env: NodeJS.ProcessEnv = process.env,
  versions: NodeVersions = process.versions,
) {
  assertEnvProxySupported(env, versions);
  const dispatcher = fetchProxyDispatcher(env);
  if (dispatcher) {
    setGlobalDispatcher(dispatcher);
  }
}
