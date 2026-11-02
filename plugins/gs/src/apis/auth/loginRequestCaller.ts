/**
 * The callers that may open the sign-in (Login Required) while a person acts.
 * Most ask the same main login provider, so the dialog alone cannot tell
 * which of them asked:
 *
 * - `portal-fetch`: the portal's own requests (`X-Backstage-Token`).
 * - `cluster-token-mint`: a broker-backed installation's cluster token.
 * - `kubernetes-token`: an installation's Kubernetes OIDC token, the main
 *   login's where the installation signs in through it.
 * - `user-settings`: the stored settings' check for a signed-in person.
 * - `github-grant`: the person's GitHub token, minted through muster.
 * - `installations-versions`: the Installations page's version columns.
 * - `muster`, `mcp`, `plans`, `platform-capabilities`, `repositories`,
 *   `roadmap`: the plugins that forward the main login's ID token to their
 *   backend.
 *
 * Not named: the sign-in page and the explicit Sign in buttons (Settings,
 * the cluster access sidebar item), which open the provider's popup
 * themselves rather than the dialog, and an MCP server's own login provider,
 * which the dialog lists under its own title. The AI chat's backend token
 * takes the app identity directly and is not named either.
 */
export type LoginRequestCaller =
  | 'portal-fetch'
  | 'cluster-token-mint'
  | 'kubernetes-token'
  | 'user-settings'
  | 'github-grant'
  | 'installations-versions'
  | 'muster'
  | 'mcp'
  | 'plans'
  | 'platform-capabilities'
  | 'repositories'
  | 'roadmap';

/**
 * Set on `document.body` while a caller waits on the sign-in's interactive
 * path: the callers, space-separated and sorted. An open Login Required
 * dialog was asked for by the callers it names; the dialog itself is
 * unchanged.
 */
export const LOGIN_REQUESTED_BY_ATTRIBUTE = 'data-login-requested-by';

const waiting = new Map<LoginRequestCaller, number>();

function render() {
  if (typeof document === 'undefined' || !document.body) {
    return;
  }
  const callers = [...waiting.keys()].sort();
  if (callers.length) {
    document.body.setAttribute(LOGIN_REQUESTED_BY_ATTRIBUTE, callers.join(' '));
  } else {
    document.body.removeAttribute(LOGIN_REQUESTED_BY_ATTRIBUTE);
  }
}

/**
 * Runs `request`, the caller's interactive call to the sign-in, with the
 * caller named in {@link LOGIN_REQUESTED_BY_ATTRIBUTE} until it settles.
 */
export async function asLoginRequestCaller<T>(
  caller: LoginRequestCaller,
  request: () => Promise<T>,
): Promise<T> {
  waiting.set(caller, (waiting.get(caller) ?? 0) + 1);
  render();
  try {
    return await request();
  } finally {
    const left = waiting.get(caller)! - 1;
    if (left) {
      waiting.set(caller, left);
    } else {
      waiting.delete(caller);
    }
    render();
  }
}

/**
 * The auth API getters that may open the sign-in, by the position of their
 * options argument: a call whose options say `optional` never prompts.
 */
const INTERACTIVE_GETTERS = new Map<PropertyKey, number>([
  ['getIdToken', 0],
  ['getProfile', 0],
  ['getBackstageIdentity', 0],
  ['getAccessToken', 1],
]);

/**
 * `authApi` as `caller` uses it: each interactive getter call runs
 * {@link asLoginRequestCaller}, so a sign-in it opens names the caller. Every
 * other member is the API's own.
 */
export function asLoginRequestCallerApi<T extends object>(
  caller: LoginRequestCaller,
  authApi: T,
): T {
  return new Proxy(authApi, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      const optionsAt = INTERACTIVE_GETTERS.get(property);
      if (optionsAt === undefined) {
        return value.bind(target);
      }
      return (...args: unknown[]) => {
        const options = args[optionsAt] as { optional?: boolean } | undefined;
        const call = () => value.apply(target, args);
        return options?.optional ? call() : asLoginRequestCaller(caller, call);
      };
    },
  });
}
