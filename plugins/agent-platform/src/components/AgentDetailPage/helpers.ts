import {
  Agent,
  AgentMcpBinding,
  toManifestYaml,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { isGatewayBinding } from '../../lib/toolset';

export { MUSTER_MCP_SERVER_NAME } from '../../lib/toolset';
import { MUSTER_MCP_SERVER_NAME } from '../../lib/toolset';

/**
 * Whether a binding reaches the muster gateway — the agent's own carrier
 * `RemoteMCPServer` (named after the agent) or the shared gateway server.
 *
 * A name match is a heuristic, so it only ever *adds* a link to the Tool
 * Explorer; a server we don't recognise is still listed, just without one.
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

  return `${tools.length} tool${tools.length === 1 ? '' : 's'}: ${tools.join(', ')}`;
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

/** The first characters of a git commit or a `sha256:` digest, as `git log --oneline` would print it. */
export function shortPin(pin: string): string {
  const digest = pin.match(/^sha256:([0-9a-f]+)$/i);
  if (digest) {
    return `sha256:${digest[1].slice(0, 12)}`;
  }
  return /^[0-9a-f]{40,64}$/i.test(pin) ? pin.slice(0, 12) : pin;
}

/**
 * The agent as the YAML a reader would compare against `kubectl get -o yaml`,
 * minus server-side-apply bookkeeping (see {@link toManifestYaml}).
 */
export function toAgentManifestYaml(agent: Agent): string {
  return toManifestYaml(agent);
}
