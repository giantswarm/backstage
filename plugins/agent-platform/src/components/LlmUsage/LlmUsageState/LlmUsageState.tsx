import { Progress } from '@backstage/core-components';
import { Text } from '@backstage/ui';
import type { LlmUsageViewModel } from '../../../hooks/useLlmUsageView';
import { WINDOW_DAYS } from '../../../lib/llmUsageQueries';
import { InstallationScopeNote } from '../../InstallationGroups';
import { NotReachableInstallationsNote } from '../../NotReachableInstallationsNote';
import { UnreachableInstallationsAlert } from '../../UnreachableInstallationsAlert';

/**
 * Every state a Mimir usage view can be in except `ready`, rendered once for
 * both views.
 *
 * Returns `null` for `ready`, so a view is
 * `<LlmUsageState view={view} />{view.state === 'ready' && …}` and neither tab
 * can answer "kagent is not here" differently from the other.
 */
export function LlmUsageState({ view }: { view: LlmUsageViewModel }) {
  const { state, installation, notReachable } = view;

  switch (state) {
    case 'no-installations':
      return (
        <Text variant="body-medium" color="secondary">
          This portal knows no installations, so there is no usage to read.
        </Text>
      );

    case 'none-reachable':
      return <NotReachableInstallationsNote installations={notReachable} />;

    case 'no-kagent':
      // Under a pinned scope `InstallationScopeNote` names the installation and
      // says kagent is not on it; under "all" there is no one installation to
      // name, so say it plainly.
      return (
        <>
          <InstallationScopeNote component="kagent" />
          <Text variant="body-medium" color="secondary">
            None of the installations this portal knows run kagent.
          </Text>
        </>
      );

    case 'loading':
      return <Progress aria-label="Loading LLM usage" />;

    case 'unavailable':
      // `mimirEnabled: false`. Not an error: a standalone installation has no
      // Mimir at all, and the sessions tab still works — which is worth saying,
      // because "no metrics" otherwise reads as the whole page being broken.
      return (
        <Text variant="body-medium" color="secondary">
          {installation} has no observability stack this portal can query, so
          there are no token or cost figures for it. Your sessions still have
          their own counts.
        </Text>
      );

    case 'error':
      return (
        <UnreachableInstallationsAlert
          installations={installation ? [installation] : []}
          resourceName="LLM metrics"
        />
      );

    case 'empty':
      // Mimir answered and there is genuinely nothing. Worth naming the one
      // reason that is not "nobody used it": an agent that talks to a provider
      // directly never reaches the gateway, so it is invisible here however
      // busy it is.
      return (
        <Text variant="body-medium" color="secondary">
          No model calls went through {installation}'s LLM gateway in the last{' '}
          {WINDOW_DAYS} days. Agents configured to call a provider directly do
          not appear here.
        </Text>
      );

    case 'ready':
    default:
      return null;
  }
}
