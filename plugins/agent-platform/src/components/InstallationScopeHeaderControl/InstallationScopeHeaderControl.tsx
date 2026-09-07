import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  InstallationScopeSelect,
  type InstallationInventoryEntry,
  type PlatformComponent,
} from '@giantswarm/backstage-plugin-gs';
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
  // Only kagent, though the Usage tab shows a muster section too. `component`
  // is a single value driving the selector's per-option remark, and the
  // personal kagent section is the page's primary content — the one whose
  // emptiness a reader will want explained. muster reports its own
  // reachability inside its section, the same division of labour the `muster`
  // row below relies on. An installation running muster but not kagent is
  // absent from the backend's kagent list, so it gets no misleading remark
  // either.
  usage: 'kagent',
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

  // The backend's kagent endpoint probe (`GET /kagent/installations`): an
  // installation whose kagent the portal cannot reach is worth saying on the
  // kagent tabs, next to what the inventory knows. muster's reachability is
  // the muster plugin's to show; its own picker marks it.
  const { isNotReachable } = useKagentInstallations();
  const describe = useCallback(
    (entry: InstallationInventoryEntry) =>
      component === 'kagent' && isNotReachable(entry.installation)
        ? NOT_REACHABLE
        : undefined,
    [component, isNotReachable],
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
