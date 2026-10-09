import { Navigate, useLocation } from 'react-router-dom';

/**
 * The shell's Customize screen, `/customize/:tab`. A page of the app, not of
 * this plugin, so it is reached by path.
 */
export const SHELL_CUSTOMIZE_PATH = '/customize';

export type ShellCustomizeRedirectProps = {
  tab: 'agents' | 'models';
};

/**
 * Sends a list the shell shows on its Customize screen there, keeping the
 * query string (the installation scope).
 */
export function ShellCustomizeRedirect({ tab }: ShellCustomizeRedirectProps) {
  const { search } = useLocation();
  return (
    <Navigate
      to={{ pathname: `${SHELL_CUSTOMIZE_PATH}/${tab}`, search }}
      replace
    />
  );
}
