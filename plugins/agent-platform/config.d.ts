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
       * Git repositories to discover agent skills from. Every `SKILL.md`
       * file in a repo defines one skill (its containing directory is the
       * skill root); the frontmatter `name`/`description` are shown in the
       * picker. A selected skill is pinned to the head commit of the
       * repository's default branch at discovery time and becomes a
       * `skills[]` entry (`{ name, path, git: { url, commit } }`) of the
       * agent's chart values. The frontend reads the list from the signed-in
       * config.
       *
       * A `https://github.com/<owner>/<repo>` entry is read through the
       * GitHub REST API (authenticated when a GitHub integration covers it;
       * otherwise on GitHub's anonymous 60-requests-an-hour limit). Any other
       * http(s) entry is read over the plain git protocol — a depth-1 clone,
       * no REST API and no API rate limit — so a lab-local git server (Gitea,
       * `git http-backend`) works; the URL must be one agents can also fetch
       * at boot, since it travels into the chart's `git.url` unchanged.
       */
      repositories?: string[];
    };
    /**
     * Which agent serves each meta-agent role (iteration-1 decision G13).
     * Values are agent names: the Agent resource's technical name, optionally
     * qualified as `<namespace>/<name>` when the same name exists in several
     * namespaces. A feature gated on a role (`useMetaAgent`) appears only when
     * the configured name resolves to an existing agent, and is hidden while
     * the role is unconfigured or unresolved. Read by the frontend from the
     * signed-in config. A platform CR becomes the source later; this stays the
     * override.
     */
    metaAgents?: {
      /**
       * Answers general questions about the platform: Customize → Agents'
       * helper banner ("Ask <agent> about agents").
       */
      generalInformation?: string;
      /** Creates and edits agents in conversation. */
      agentManagement?: string;
      /** Creates and edits workflows in conversation. */
      workflowManagement?: string;
      /** Operates the platform itself. */
      platformOperations?: string;
      /** Reviews a skill: the skill detail page's Evaluate button. */
      skillEvaluation?: string;
    };
    /**
     * Integrations of the platform that live outside the portal, which the
     * portal only points people at. Read by the frontend from the signed-in
     * config.
     */
    integrations?: {
      /**
       * Whether the new-session home shows the "Use your agents right in
       * Slack" banner (dismissible, per person). Set it to `true` once the
       * installation's Slack integration (klaus-gateway) is set up for the
       * people using this portal. Off by default: an unconfigured portal shows
       * nothing.
       */
      slack?: boolean;
    };
  };
}
