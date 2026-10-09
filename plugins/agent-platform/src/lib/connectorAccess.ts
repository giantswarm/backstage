import type { ConnectorPageTarget } from '@giantswarm/backstage-plugin-muster';
import {
  DeclaredToolset,
  parseSelector,
  PRESET_FULL,
  PRESET_READ_ONLY,
} from './toolset';

/**
 * What an agent may use of a connector, in a few words, read off its declared
 * toolset; undefined when the toolset does not reach the connector, or cannot
 * be read.
 *
 * - "All tools": the toolset is `preset:full`, names the connector with a
 *   `server:` selector, or the agent binds the gateway without declaring one.
 * - "Look things up": `preset:read-only`, which reaches the connector's
 *   read-only tools (unless the connector is known to have none).
 * - "N tools": the `tool:` selectors that name tools of the connector.
 *
 * Other presets are defined by the installation and resolved by muster, so
 * they are not counted here.
 */
export function connectorAccess(
  toolset: DeclaredToolset | undefined,
  target: Pick<
    ConnectorPageTarget,
    'serverNames' | 'ownsTool' | 'readOnlyToolCount'
  >,
): string | undefined {
  if (!toolset) {
    return undefined;
  }
  if (toolset.state === 'implicit-full') {
    return 'All tools';
  }
  if (toolset.state !== 'declared') {
    return undefined;
  }
  const selectors = toolset.selectors
    .map(parseSelector)
    .filter(selector => selector !== undefined);
  if (
    toolset.selectors.includes(PRESET_FULL) ||
    selectors.some(
      selector =>
        selector.kind === 'server' &&
        target.serverNames.includes(selector.name),
    )
  ) {
    return 'All tools';
  }
  const parts: string[] = [];
  if (
    toolset.selectors.includes(PRESET_READ_ONLY) &&
    target.readOnlyToolCount !== 0
  ) {
    parts.push('Look things up');
  }
  const tools = new Set(
    selectors
      .filter(
        selector => selector.kind === 'tool' && target.ownsTool(selector.name),
      )
      .map(selector => selector.name),
  ).size;
  if (tools > 0) {
    parts.push(`${tools} ${tools === 1 ? 'tool' : 'tools'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
