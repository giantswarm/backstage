/**
 * The meta-agent roles the portal knows (iteration-1 decision G13): platform
 * features light up when a role resolves to an existing agent and stay hidden
 * otherwise. The mapping from role to agent comes from app-config
 * (`agentPlatform.metaAgents`), until a platform CR becomes the source and the
 * config stays as the override.
 */
export const META_AGENT_ROLES = [
  /** Answers general questions about the platform. */
  'generalInformation',
  /** Creates and edits agents in conversation (the create flow's assistant). */
  'agentManagement',
  /** Creates and edits workflows in conversation (the UI is read-only). */
  'workflowManagement',
  /** Operates the platform itself. */
  'platformOperations',
  /** Reviews a skill and reports on its quality (SkillDetail's Evaluate). */
  'skillEvaluation',
  /**
   * Writes complex, multi-file skills in conversation (the Add/Edit Skill
   * forms' hand-off; the forms themselves stay SKILL.md-only).
   */
  'skillCreation',
] as const;

export type MetaAgentRole = (typeof META_AGENT_ROLES)[number];

/**
 * The configured role mapping: each role names an agent, as the agent's
 * technical (resource) name, optionally qualified as `<namespace>/<name>`.
 * Every role is optional — an absent one hides the features needing it.
 */
export type MetaAgents = Partial<Record<MetaAgentRole, string>>;

/**
 * The slice of a Backstage `Config` reader this module needs, so the reader
 * works against the frontend's signed-in config and a backend
 * `RootConfigService` alike without depending on either package.
 */
export interface MetaAgentsConfigReader {
  getOptionalString(key: string): string | undefined;
}

/**
 * Reads `agentPlatform.metaAgents` from a config reader: the configured agent
 * name per role, roles left unconfigured (or set to a blank string) absent.
 * `undefined` config — not signed in yet, or no config at all — reads as no
 * roles configured.
 */
export function readMetaAgents(
  config: MetaAgentsConfigReader | undefined,
): MetaAgents {
  if (!config) {
    return {};
  }
  const metaAgents: MetaAgents = {};
  for (const role of META_AGENT_ROLES) {
    const name = config
      .getOptionalString(`agentPlatform.metaAgents.${role}`)
      ?.trim();
    if (name) {
      metaAgents[role] = name;
    }
  }
  return metaAgents;
}
