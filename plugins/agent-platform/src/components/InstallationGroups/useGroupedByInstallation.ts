import {
  ALL_INSTALLATIONS,
  useInstallationScope,
} from '@giantswarm/backstage-plugin-gs';

/**
 * Whether a fleet-wide list renders as one group per installation: only under
 * "All installations" on a portal that knows more than one. A pinned scope is
 * one installation, and a single-installation portal (the standalone chart)
 * never had installations to tell apart -- both keep the flat table, so the
 * page looks exactly as it did before the section had a scope.
 */
export function useGroupedByInstallation(): boolean {
  const { scope, isSingleInstallation } = useInstallationScope();
  return scope === ALL_INSTALLATIONS && !isSingleInstallation;
}
