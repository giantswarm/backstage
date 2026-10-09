export interface Config {
  /**
   * Configuration for the agent-platform plugin's frontend.
   *
   * Agents are created, validated and deployed through agent-manager's tools
   * over the installation's muster, as the signed-in person — the chart,
   * its version range, the Flux settings and the platform Harness are
   * agent-manager's to report (`get_info`) and are not configured here.
   */
  agentPlatform?: {
    /** Model metadata the platform itself does not report. */
    models?: {
      /**
       * Context-window sizes per model, in tokens, for the chat's memory
       * indicator — nothing in the platform reports a hosted model's window
       * (kagent's ModelConfig has no such field), so it is configured here.
       *
       * Keys are model-name patterns matched case-insensitively against the
       * provider's model name (the ModelConfig's `spec.model`); `*` matches
       * any run of characters, and the most specific matching pattern wins.
       * Values are the window size in tokens. A model no pattern names shows
       * its raw token count instead of a percentage.
       *
       * Example: `{ 'claude-*': 200000, 'gpt-5*': 400000 }`.
       */
      contextWindows?: {
        [modelPattern: string]: number;
      };
    };
    /** Skill discovery for the create flow. */
    skills?: {
      /**
       * GitHub repositories to discover agent skills from. Every `SKILL.md`
       * file in a repo defines one skill (its containing directory is the
       * skill root); the frontmatter `name`/`description` are shown in the
       * picker. A selected skill is pinned to the head commit of the
       * repository's default branch at discovery time and becomes a
       * `skills[]` entry (`{ name, path, git: { url, commit } }`) of the
       * agent's chart values. The frontend reads the list from the signed-in
       * config.
       */
      repositories?: string[];
    };
  };
}
