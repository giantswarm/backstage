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
 * `HTTPS_PROXY`, `NO_PROXY`); its dispatcher is left alone then.
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

/**
 * Installs {@link fetchProxyDispatcher} as the global dispatcher of native
 * `fetch`. Call once, before the backend starts.
 */
export function configureFetchProxy(env: NodeJS.ProcessEnv = process.env) {
  const dispatcher = fetchProxyDispatcher(env);
  if (dispatcher) {
    setGlobalDispatcher(dispatcher);
  }
}
