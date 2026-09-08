import {
  coreExtensionData,
  createExtension,
  ExtensionBoundary,
} from '@backstage/frontend-plugin-api';

/**
 * The installation-wide MCP usage section, contributed to the Agent Platform's
 * Usage tab.
 *
 * **The contract, spelled out because it is a cross-plugin coupling by string:**
 * the target node is `sub-page:agent-platform/usage` and the input is
 * `sections`, declared there with `SubPageBlueprint.makeWithOverrides` +
 * `createExtensionInput([coreExtensionData.reactElement])`. Both ends carry this
 * comment; changing either without the other makes the section silently vanish.
 *
 * An attachment rather than a component import, so **neither plugin depends on
 * the other**: this is the same mechanism muster already uses to put its own
 * "MCP Servers" tab on `page:agent-platform`, one level deeper. It also means
 * the section is simply absent when muster is not registered — where a static
 * import would pull muster's whole bundle into the Usage tab regardless — and
 * that it has a real extension id, so a deployment can switch it off.
 *
 * A plain `createExtension` rather than a shared blueprint: there is exactly one
 * contributor, and `createExtensionBlueprint` earns its keep only with several
 * (flux has seven filters). If a second one ever appears, promote this to an
 * `AgentPlatformUsageSectionBlueprint` exported from that plugin's `alpha`
 * entry point, mirroring `plugins/flux-react/src/alpha/blueprints/`.
 */
export const mcpUsageSection = createExtension({
  kind: 'agent-platform-usage-section',
  name: 'mcp-usage',
  attachTo: { id: 'sub-page:agent-platform/usage', input: 'sections' },
  output: [coreExtensionData.reactElement],
  factory({ node }) {
    return [
      coreExtensionData.reactElement(
        ExtensionBoundary.lazy(node, async () => {
          const { McpUsageSection } =
            await import('./components/McpUsageSection');
          return <McpUsageSection />;
        }),
      ),
    ];
  },
});
