export interface Config {
  /** Configuration for the agent-platform plugin. */
  agentPlatform?: {
    /**
     * Chart the create flow adapts (the `agent` chart,
     * github.com/giantswarm/agent), published at
     * `oci://gsoci.azurecr.io/charts/giantswarm/agent`.
     */
    chart?: {
      /**
       * OCI URL of the chart, without a tag
       * (e.g. `oci://gsoci.azurecr.io/charts/giantswarm/agent`).
       * @visibility frontend
       */
      ociUrl?: string;
      /**
       * Chart version the generated manifests pin to.
       * @visibility frontend
       */
      version?: string;
    };

    /**
     * ServiceAccount the generated HelmRelease runs as
     * (`spec.serviceAccountName`). GS's Flux multi-tenancy admission policy
     * requires this for HelmReleases in tenant namespaces (which the agent's
     * namespace is). The referenced ServiceAccount must exist in that namespace
     * with RBAC to install the chart. Provisional until the platform defines
     * the canonical agent-deployment ServiceAccount.
     * @visibility frontend
     */
    fluxServiceAccountName?: string;

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
