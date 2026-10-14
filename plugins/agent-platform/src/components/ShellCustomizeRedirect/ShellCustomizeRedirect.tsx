import { Navigate, useLocation } from 'react-router-dom';
import { EmptyStateCard } from '@giantswarm/backstage-plugin-ui-react';

import { useCustomizePaths } from '../../hooks/useCustomizePaths';

/**
 * The shell's Customize screen, `/customize/:tab`. A page of the app, not of
 * this plugin. New code reaches it through `useCustomizePaths`, which follows
 * the app's binding; the pages still linking by this path move with the URL
 * audit.
 */
export const SHELL_CUSTOMIZE_PATH = '/customize';

export type ShellCustomizeRedirectProps = {
  tab: 'agents' | 'models';
};

/**
 * Sends a list the shell shows on its Customize screen there, keeping the
 * query string (the installation scope), through the `customize` route the
 * app binds (`useCustomizePaths`). Where the app binds none, there is no list
 * to send anyone to, and an empty state says so instead of a dead link.
 */
export function ShellCustomizeRedirect({ tab }: ShellCustomizeRedirectProps) {
  const { search } = useLocation();
  const { customize } = useCustomizePaths();
  if (!customize) {
    return (
      <EmptyStateCard
        title="Not available"
        description={`This portal has no Customize page, where the ${tab} are listed.`}
      />
    );
  }
  return <Navigate to={{ pathname: `${customize}/${tab}`, search }} replace />;
}
