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
    /** Skill discovery for the create flow. */
    skills?: {
      /**
       * GitHub repositories to discover agent skills from. Every `SKILL.md`
       * file in a repo defines one skill (its containing directory is the
       * skill root); the frontmatter `name`/`description` are shown in the
       * picker. A selected skill is pinned to the head commit of the
       * repository's default branch at discovery time and becomes a
       * `skills[]` entry (`{ name, path, git: { url, commit } }`) of the
       * agent's chart values.
       * @visibility frontend
       */
      repositories?: string[];
    };
  };
}
