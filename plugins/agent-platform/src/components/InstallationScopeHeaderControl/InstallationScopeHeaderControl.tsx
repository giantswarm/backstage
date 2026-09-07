import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  InstallationScopeSelect,
  type InstallationInventoryEntry,
  type PlatformComponent,
} from '@giantswarm/backstage-plugin-gs';
import { useMusterInstallations } from '@giantswarm/backstage-plugin-muster';
import { useKagentInstallations } from '../../hooks/useKagentInstallations';
import { QueryClientProvider } from '../QueryClientProvider';

/**
 * Which platform component each level-1 tab reads, by the first segment of its
 * path under `/agent-platform`. Agents, Sessions and Models are kagent's;
 * "MCP Servers" is the muster plugin's tab, mounted at `muster` (see
 * `plugins/muster/src/plugin.tsx`). An unknown segment (the section index, a
 * future tab) gets no component: every platform installation is then offered
 * without a per-tab remark.
 */
const TAB_COMPONENTS: Record<string, PlatformComponent> = {
  agents: 'kagent',
  sessions: 'kagent',
  models: 'kagent',
  muster: 'muster',
};

/** Exported for tests: the component a splat path under the page reads. */
export function componentForTab(splat: string): PlatformComponent | undefined {
  const [tab] = splat.replace(/^\/+/, '').split('/');
  return TAB_COMPONENTS[tab];
}

const NOT_REACHABLE = 'not reachable from this portal';

function HeaderControl() {
  // The header is rendered by the page mounted at `/agent-platform/*`, so the
  // splat is the path within the section: `agents`, `sessions/<inst>/<id>`, …
  const splat = useParams()['*'] ?? '';
  const component = componentForTab(splat);

  // The backends' endpoint probes (`GET /kagent/installations`, the muster
  // backend's `/installations`): an installation whose kagent (on the kagent
  // tabs) or muster (on the MCP Servers tab) the portal cannot reach is worth
  // saying next to what the inventory knows -- this selector is the one
  // control that scopes the muster section too, and its views say the same
  // instead of offering a connect that cannot help.
  const { isNotReachable: kagentNotReachable } = useKagentInstallations();
  const { isNotReachable: musterNotReachable } = useMusterInstallations();
  const describe = useCallback(
    (entry: InstallationInventoryEntry) => {
      const notReachable =
        (component === 'kagent' && kagentNotReachable(entry.installation)) ||
        (component === 'muster' && musterNotReachable(entry.installation));
      return notReachable ? NOT_REACHABLE : undefined;
    },
    [component, kagentNotReachable, musterNotReachable],
  );

  return (
    <div style={{ minWidth: 220 }}>
      <InstallationScopeSelect component={component} describe={describe} />
    </div>
  );
}

/**
 * The section's installation scope selector, as a plugin header action of the
 * Agent Platform page (`PluginHeaderActionBlueprint` in `plugin.tsx`), so one
 * control in the page header scopes every tab -- the three of this plugin and
 * the muster plugin's -- and stays put while the tabs change underneath.
 *
 * Wrapped in this plugin's `QueryClientProvider`: the header renders outside
 * the tab routers, and the selector reads the installation inventory through
 * react-query. The client is shared with the tabs, so the inventory is read
 * once per page load, not once per mount.
 */
export function InstallationScopeHeaderControl() {
  return (
    <QueryClientProvider>
      <HeaderControl />
    </QueryClientProvider>
  );
}
