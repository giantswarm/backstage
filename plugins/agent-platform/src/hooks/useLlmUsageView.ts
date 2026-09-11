import { useLlmUsage } from './useLlmUsage';
import { useUsageInstallation } from './useUsageInstallation';
import { hasAnyLlmUsage, type LlmUsage } from '../lib/llmUsage';

/**
 * Which of the eight things the LLM usage views can be showing.
 *
 * A discriminant rather than a ready-made element, so the ladder lives in one
 * place without putting JSX in a hook: `LlmUsageState` renders every state but
 * `ready`, and a view renders its body only for that one.
 */
export type LlmUsageState =
  /** The portal knows no installations at all. */
  | 'no-installations'
  /** Everything in scope that runs kagent is unreachable from this portal. */
  | 'none-reachable'
  /** Nothing in scope runs kagent. */
  | 'no-kagent'
  | 'loading'
  /** The installation is opted out of Mimir (`mimirEnabled: false`). */
  | 'unavailable'
  | 'error'
  /** Mimir answered, and the window holds no model calls. */
  | 'empty'
  | 'ready';

export type LlmUsageViewModel = {
  state: LlmUsageState;
  usage: LlmUsage | undefined;
  installation: string | undefined;
  /** True when the pinned scope is "all" and one installation was chosen for us. */
  isResolvedFromAll: boolean;
  notReachable: string[];
};

/**
 * The one resolution-and-state ladder both Mimir views share.
 *
 * Sharing it is the point: two tabs reading the same nine queries for the same
 * installation must never disagree about which installation that is or whether
 * there is anything to show. The order mirrors `AgentUsageSection`'s, so the
 * three tabs answer "no installations" and "kagent is not here" identically.
 *
 * The installation comes from `useUsageInstallation`, which only ever resolves
 * out of the *reachable* candidates — so an unreachable installation can never
 * be the one being read, and `notReachable` is only carried for the copy.
 */
export function useLlmUsageView(): LlmUsageViewModel {
  const {
    installation,
    candidates,
    isResolvedFromAll,
    notReachable,
    isLoading: isResolving,
    hasInstallations,
  } = useUsageInstallation();

  const { usage, isLoading, isError, isAvailable } = useLlmUsage(installation);

  const state = ((): LlmUsageState => {
    if (!isResolving && !hasInstallations) {
      return 'no-installations';
    }
    if (!isResolving && candidates.length === 0) {
      return notReachable.length > 0 ? 'none-reachable' : 'no-kagent';
    }
    // Before `unavailable`: `useMimirQuery` reports loading while the
    // installations config is still resolving, which is exactly when
    // availability is `undefined` — claiming "no metrics here" then would
    // retract itself a moment later.
    if (isResolving || isLoading) {
      return 'loading';
    }
    if (isAvailable === false) {
      return 'unavailable';
    }
    if (isError) {
      return 'error';
    }
    // Zeros across a strip and two empty charts read as a broken page, so an
    // empty window says so instead.
    return hasAnyLlmUsage(usage) ? 'ready' : 'empty';
  })();

  return { state, usage, installation, isResolvedFromAll, notReachable };
}
