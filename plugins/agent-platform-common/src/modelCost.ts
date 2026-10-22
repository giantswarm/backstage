/**
 * The signed-in person's own model cost on one installation, as the gateway
 * priced it: the wire shape of `GET /usage/model-cost`, which the Usage
 * screen's "Your sessions" view shows in place of an estimate.
 *
 * The person is never a parameter. The backend asks kagent who the caller is
 * (`SystemService/GetCurrentUser`, with the caller's own token), builds the
 * PromQL itself, and filters the gateway's cost counter by that identity — so
 * the route cannot be pointed at anyone else.
 */

/** The longest window the route answers for, the Usage screen's widest. */
export const MODEL_COST_MAX_DAYS = 90;

/**
 * Why there is no actual cost to show, each a different thing for the page to
 * say beside the estimate it falls back to:
 *
 * - `identity-unreadable`: kagent could not be asked who the caller is just
 *   now.
 * - `no-identity`: kagent named no person for the caller — no email in its
 *   claims, or the shared built-in user of its `unsecure` mode.
 * - `no-mimir`: the installation has no Mimir this portal can query.
 * - `not-recorded`: no cost series in the window names a person (no `user`,
 *   or only `unknown`): a gateway from before the label, or one that resolves
 *   no identity on the call.
 * - `no-spend`: the gateway records users, but priced none of this person's
 *   calls in the window — no calls through it, or only unpriced models.
 * - `unreadable`: Mimir did not answer just now.
 */
export type ModelCostUnavailableReason =
  | 'identity-unreadable'
  | 'no-identity'
  | 'no-mimir'
  | 'not-recorded'
  | 'no-spend'
  | 'unreadable';

/** One agent's share of the person's cost. */
export type ModelCostAgentEntry = {
  /**
   * The agent in kagent's encoding (`encodeKagentAgentId`), so it joins the
   * session usage's `byAgent` rows directly.
   */
  agentId: string;
  costUsd: number;
};

export type ModelCostResponse =
  | {
      status: 'actual';
      windowDays: number;
      /**
       * Every priced model call the gateway attributed to the person in the
       * window, whichever agent (or none) made it. More than the sum of
       * `byAgent` when some calls came from outside an agent's pod.
       */
      totalUsd: number;
      byAgent: ModelCostAgentEntry[];
      /**
       * Some cost series in the window name no person (no `user` label, or
       * `unknown`), so the person's total may be a lower bound.
       */
      partial: boolean;
      /** Epoch milliseconds the figures were read at. */
      evaluatedAt: number;
    }
  | {
      status: 'unavailable';
      windowDays: number;
      reason: ModelCostUnavailableReason;
    };
