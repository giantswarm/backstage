export interface Config {
  /** Configuration for the agent-platform plugin. */
  agentPlatform?: {


    /**
     * Catalog entity ref of the hidden Template that applies the composed
     * manifest via the `kube:apply` scaffolder action. Defaults to
     * `template:default/agent-deployment`.
     * @visibility frontend
     */
    deployTemplateRef?: string;

    /** Skill discovery for the create flow. */
    skills?: {
      /**
       * GitHub repositories to discover agent skills from. Every `SKILL.md`
       * file in a repo defines one skill (its containing directory is the
       * skill root); the frontmatter `name`/`description` are shown in the
       * picker, and a selected skill becomes a `spec.skills.gitRefs` entry
       * (repo url + subdirectory path).
       * @visibility frontend
       */
      repositories?: string[];
    };
  };
}
