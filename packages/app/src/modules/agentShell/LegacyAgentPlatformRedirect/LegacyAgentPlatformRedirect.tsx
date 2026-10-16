import { Navigate, useLocation } from 'react-router-dom';
import {
  ALL_INSTALLATIONS,
  useInstallationScope,
} from '@giantswarm/backstage-plugin-gs';
import { legacyAgentPlatformTarget } from '../legacyPaths';

/**
 * An address of the Agent Platform's old URL tree (`/agent-platform/**`, and
 * the older `/agents/**`), sent in one hop to where it lives now
 * (`legacyAgentPlatformTarget`), its hash kept. Until the end of 2026
 * (giantswarm/giantswarm#38510): links, bookmarks and docs out there keep
 * landing on their page.
 *
 * An old connector, tool or workflow link without `?installation=` named the
 * pinned scope, else the home installation — the one the old page fell back
 * to — so the redirect waits for the installations config to know it.
 */
export function LegacyAgentPlatformRedirect() {
  const { pathname, search, hash } = useLocation();
  const { scope, home, isLoading } = useInstallationScope();
  if (isLoading) {
    return null;
  }
  const defaultInstallation =
    (scope === ALL_INSTALLATIONS ? home : scope) ?? '';
  const target = legacyAgentPlatformTarget(pathname, search, {
    defaultInstallation,
  });
  return (
    <Navigate
      to={target ? `${target.pathname}${target.search}${hash}` : '/'}
      replace
    />
  );
}
