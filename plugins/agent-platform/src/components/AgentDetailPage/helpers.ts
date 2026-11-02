import {
  Agent,
  AgentMcpBinding,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { countNoun } from '@giantswarm/backstage-plugin-ui-react';

import { isGatewayBinding } from '../../lib/toolset';

export { MUSTER_MCP_SERVER_NAME } from '../../lib/toolset';
import { MUSTER_MCP_SERVER_NAME } from '../../lib/toolset';

/**
 * Whether a binding reaches the muster gateway — the agent's own carrier
 * `RemoteMCPServer` (named after the agent) or the shared gateway server.
 *
 * The rule `toolsetOfAgent` reads the toolset by (`isGatewayBinding`), so a
 * binding this does not recognise is one the Tools tab cannot resolve either:
 * the page lists it by name among the directly bound servers instead.
 */
export function isGatewayServerBinding(
  agent: Pick<Agent, 'getName'>,
  binding: AgentMcpBinding,
): boolean {
  return isGatewayBinding(agent, binding, MUSTER_MCP_SERVER_NAME);
}

/**
 * `<kind> <name>` for an MCP binding. Bindings are same-namespace on API v2,
 * so the name alone identifies the server within the agent's namespace.
 */
export function mcpBindingId(binding: AgentMcpBinding): string {
  return `${binding.server.kind} ${binding.server.name}`;
}

/**
 * How the agent's access to a server it binds directly (not through the
 * gateway) is scoped, in words.
 *
 * `tools` is an allowlist; an absent or empty one means the agent may call
 * everything the server exposes, which is worth stating rather than leaving to
 * be inferred from a missing value.
 */
export function describeToolScope(binding: AgentMcpBinding): string {
  const tools = binding.tools ?? [];
  if (tools.length === 0) {
    return 'All tools from this server';
  }

  return `${countNoun(tools.length, 'tool')}: ${tools.join(', ')}`;
}

/**
 * What a skill row needs to label itself. Structural rather than the class's
 * own `AgentSkill`, so the label logic is testable with bare objects.
 */
type SkillLike = { name?: string; path?: string; url?: string };

/**
 * Display label for a mounted skill: the explicit `name` when the manifest sets
 * one, else the last segment of the path it is mounted from, else the source
 * itself. Never empty, because a row with no label is unusable.
 */
export function skillLabel(skill: SkillLike): string {
  if (skill.name) {
    return skill.name;
  }

  const fromPath = (skill.path ?? '').split('/').filter(Boolean).pop();
  if (fromPath) {
    return fromPath;
  }

  const url = skill.url ?? '';
  const fromUrl = url
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean)
    .pop();

  return fromUrl ?? url;
}
