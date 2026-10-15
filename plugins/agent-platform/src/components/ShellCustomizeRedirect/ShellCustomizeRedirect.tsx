import { Navigate, useLocation } from 'react-router-dom';
import { EmptyStateCard } from '@giantswarm/backstage-plugin-ui-react';

import { useCustomizePaths } from '../../hooks/useCustomizePaths';

export type ShellCustomizeRedirectProps = {
  tab: 'agents' | 'skills' | 'models';
  /**
   * Whether the query string comes along (the installation scope). The skill
   * pages' redirects never carried it: skills are not per-installation.
   */
  keepSearch?: boolean;
};

/**
 * Sends a list the shell shows on its Customize screen there, keeping the
 * query string (the installation scope), through the `customize` route the
 * app binds (`useCustomizePaths`). Where the app binds none, there is no list
 * to send anyone to, and an empty state says so instead of a dead link.
 */
export function ShellCustomizeRedirect({
  tab,
  keepSearch = true,
}: ShellCustomizeRedirectProps) {
  const { search } = useLocation();
  const target = useCustomizePaths()[tab];
  if (!target) {
    return (
      <EmptyStateCard
        title="Not available"
        description={`This portal has no Customize page, where the ${tab} are listed.`}
      />
    );
  }
  return (
    <Navigate
      to={{
        pathname: target,
        search: keepSearch ? search : undefined,
      }}
      replace
    />
  );
}
