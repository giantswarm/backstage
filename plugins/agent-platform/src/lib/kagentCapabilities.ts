/**
 * Per-installation kagent capabilities.
 *
 * Deliberately *not* derived from a version number. kagent serves `/version` at
 * its server root, and neither door we reach it through routes the root to the
 * controller (the derived door's nginx sends `/` to the kagent UI; the
 * agentgateway override only matches the `/kagent` prefix), and nothing under
 * `/api` reports the controller version either. So a version probe would fail on
 * every healthy installation — see the comment in agent-platform-backend's
 * KagentClient.
 *
 * Version *tolerance* does not depend on version detection: it lives in the
 * permissive parsing in `kagentSchema.ts` / `kagentSessions.ts`, which absorbs
 * schema drift regardless of which kagent version an installation runs. What
 * lives here is only what we can actually observe.
 *
 * If a future feature needs version gating, probe by behaviour — call a
 * version-specific endpoint and treat a 404 as "absent" — rather than trying to
 * read a version string.
 */
export type KagentCapabilities = {
  /**
   * Whether sessions are scoped to the signed-in user.
   *
   * False when the controller runs in `unsecure` mode, where the forwarded token
   * is ignored and every caller resolves to a shared built-in user — so the list
   * is *not* "your sessions" and must not be labelled as such. Undefined until
   * the identity probe resolves.
   */
  isUserScoped?: boolean;
};

/** Capabilities assumed before (or instead of) a successful probe: claim nothing. */
export const FALLBACK_KAGENT_CAPABILITIES: KagentCapabilities = {
  isUserScoped: undefined,
};

/**
 * kagent's `unsecure` auth mode ignores the forwarded token and resolves every
 * caller to a shared built-in user, so seeing that subject means the list is not
 * this user's.
 */
const UNSCOPED_SUBJECTS = ['admin@kagent.dev'];

/**
 * Whether the subject kagent reported means the session list is user-scoped.
 *
 * An absent subject is treated as *not* scoped: we cannot confirm scoping, and
 * wrongly claiming it is the more misleading of the two errors.
 */
export function isUserScopedSubject(sub: string | undefined): boolean {
  if (!sub) {
    return false;
  }
  return !UNSCOPED_SUBJECTS.includes(sub);
}
