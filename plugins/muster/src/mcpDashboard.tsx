import {
  coreExtensionData,
  createExtension,
  ExtensionBoundary,
} from '@backstage/frontend-plugin-api';

/**
 * The MCP dashboard, contributed to the Agent Platform's Dashboards tab as its
 * "MCP" view.
 *
 * **The contract, spelled out because it is a cross-plugin coupling by string:**
 * the target node is `sub-page:agent-platform/dashboards` and the input is
 * `mcpDashboard`, declared there with `SubPageBlueprint.makeWithOverrides` +
 * `createExtensionInput([coreExtensionData.reactElement])`. Both ends carry this
 * comment; changing either without the other makes the tab silently vanish.
 *
 * The tab's **path and title live on that end**, not here: the route has to
 * exist for the redirects pointing at it to resolve, and the tab strip needs a
 * label before this element loads.
 *
 * An attachment rather than a component import, so **neither plugin depends on
 * the other**: this is the same mechanism muster already uses to put its own
 * "MCP Servers" tab on `page:agent-platform`, one level deeper. It also means
 * the tab is simply absent when muster is not registered — where a static
 * import would pull muster's whole bundle into the Dashboards tab regardless —
 * and that it has a real extension id, so a deployment can switch it off.
 *
 * A plain `createExtension` rather than a shared blueprint: there is exactly one
 * contributor, and `createExtensionBlueprint` earns its keep only with several
 * (flux has seven filters). If a second one ever appears, promote this to an
 * `AgentPlatformDashboardBlueprint` exported from that plugin's `alpha` entry
 * point, mirroring `plugins/flux-react/src/alpha/blueprints/` — and give it
 * outputs for the tab's path and title, which a second dashboard would need to
 * name for itself.
 */
export const mcpDashboard = createExtension({
  kind: 'agent-platform-dashboard',
  name: 'mcp',
  attachTo: { id: 'sub-page:agent-platform/dashboards', input: 'mcpDashboard' },
  output: [coreExtensionData.reactElement],
  factory({ node }) {
    return [
      coreExtensionData.reactElement(
        ExtensionBoundary.lazy(node, async () => {
          const { McpDashboard } = await import('./components/McpDashboard');
          return <McpDashboard />;
        }),
      ),
    ];
  },
});
