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
   * Whether sessions are scoped to the signed-in user. **Tri-state.**
   *
   * - `true` — kagent reported a real user subject.
   * - `false` — kagent reported its `unsecure`-mode shared built-in user, so the
   *   list is *not* "your sessions" and must not be labelled as such.
   * - `undefined` — we don't know: the probe hasn't resolved, failed, or reported
   *   no subject at all.
   *
   * The third case is reachable on a healthy deployment: `/api/me` returns the
   * token's claims verbatim, so an IdP that doesn't emit `sub` (or a controller
   * configured with a different `userIdClaim`) yields no subject. Collapsing that
   * into `false` would show an odd-but-working installation the very "these
   * aren't your sessions" warning this probe exists to avoid, so callers must
   * treat `undefined` as "stay silent" rather than as either answer.
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
 * Returns `undefined` when no subject was reported: that is "we can't tell",
 * which is distinct from "confirmed shared user". Reporting `false` there would
 * flag a healthy deployment whose IdP simply doesn't emit `sub`.
 */
export function isUserScopedSubject(
  sub: string | undefined,
): boolean | undefined {
  if (!sub) {
    return undefined;
  }
  return !UNSCOPED_SUBJECTS.includes(sub);
}
