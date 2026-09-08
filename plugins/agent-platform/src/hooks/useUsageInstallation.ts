import { useMemo } from 'react';
import {
  ALL_INSTALLATIONS,
  applyInstallationScope,
  useInstallationInventory,
  useInstallationScope,
} from '@giantswarm/backstage-plugin-gs';
import { useKagentInstallations } from './useKagentInstallations';

export type UsageInstallationView = {
  /** The one installation the page reads, or undefined while resolving. */
  installation: string | undefined;
  /** kagent installations in scope that the backend proxies, home first. */
  candidates: string[];
  /**
   * True when the scope is "all installations" and the page picked one on the
   * user's behalf, so it can say which one it is reporting on.
   */
  isResolvedFromAll: boolean;
  /** In-scope kagent installations the backend reports unreachable. */
  notReachable: string[];
  isLoading: boolean;
  /** Whether the portal knows any installation at all. */
  hasInstallations: boolean;
};

/**
 * The single installation the Usage page reports on.
 *
 * **Deliberately one at a time, not a fleet fan-out**, which is where this page
 * diverges from the Sessions tab. Four reasons: each installation costs a whole
 * session-list-plus-task fan-out, the most expensive read in the plugin;
 * "your tokens across five installations" answers no question, because the
 * model bill and the agents are per installation; the MCP section on the same
 * page is one muster per installation and cannot fan out either, so fanning out
 * the top section would give one page two scope semantics; and it keeps the
 * page's state matrix small enough to get right.
 *
 * Resolution mirrors muster's `resolveActive` minus its host heuristic: a
 * pinned scope wins if it runs kagent, then the home installation, then the
 * first candidate.
 */
export function useUsageInstallation(): UsageInstallationView {
  const inventory = useInstallationInventory();
  const { scope, home, isSingleInstallation } = useInstallationScope();
  const {
    proxied,
    notReachable,
    isLoading: isLoadingAllowlist,
    isError: allowlistFailed,
  } = useKagentInstallations();

  const withKagent = inventory.installationsWith('kagent');
  const inScope = applyInstallationScope(withKagent, scope);

  // Keyed on contents, not identity: the arrays are derived fresh each render.
  const inScopeKey = inScope.join(',');
  const proxiedKey = proxied.join(',');
  const notReachableKey = notReachable.join(',');

  const { candidates, unreachableInScope } = useMemo(() => {
    // A backend hiccup must not look like "you have no usage": fall back to the
    // inventory's kagent installations, exactly as the sessions provider does.
    if (allowlistFailed) {
      return { candidates: inScope, unreachableInScope: [] as string[] };
    }
    const allowed = new Set(proxied);
    const unreachable = new Set(notReachable);
    return {
      candidates: inScope.filter(name => allowed.has(name)),
      // Only installations that actually run kagent: a derived-but-unreachable
      // kagent URL on an installation without kagent is nothing to report.
      unreachableInScope: inScope.filter(name => unreachable.has(name)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inScopeKey, proxiedKey, notReachableKey, allowlistFailed]);

  // `scope` is either `'all'` or a pinned name — never absent — so "the user
  // chose this one" is exactly "not all".
  const pinned = scope === ALL_INSTALLATIONS ? undefined : scope;

  // A pinned scope wins if it runs kagent, then the home installation, then
  // whatever is left. A pinned scope that does *not* run kagent resolves to
  // nothing rather than falling back: the pin is a deliberate choice, and
  // quietly reporting another installation's usage under it would misattribute
  // someone's tokens.
  const preferred = pinned !== undefined ? [pinned] : [home, candidates[0]];
  const installation = preferred.find(
    (name): name is string => name !== undefined && candidates.includes(name),
  );

  return {
    installation,
    candidates,
    // Only when the page chose for the user: a pinned scope is their choice, and
    // a single-installation portal has nothing to disambiguate.
    isResolvedFromAll:
      installation !== undefined &&
      pinned === undefined &&
      !isSingleInstallation &&
      candidates.length > 1,
    notReachable: unreachableInScope,
    isLoading: inventory.isLoading || inventory.isProbing || isLoadingAllowlist,
    hasInstallations: inventory.entries.length > 0,
  };
}
