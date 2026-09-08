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
     * ServiceAccount the generated HelmRelease executes as
     * (`spec.serviceAccountName`). This is the tenant identity the Agent
     * Platform chart's connectivity component renders in the agent namespace
     * — a ServiceAccount with a namespace-scoped RoleBinding to `cluster-admin`
     * — named by the chart value `kagent.fluxServiceAccountName` (default
     * `kagent-flux`). The same chart value feeds agent-manager, so an
     * installation that renames the account does so in one place and sets
     * this key to match. Required under a Flux multi-tenancy lockdown (the
     * admission policy on Giant Swarm management clusters, or a helm-controller
     * with a rights-less default ServiceAccount): a HelmRelease without it
     * executes as the default account and fails. Unset, the HelmRelease
     * carries no `spec.serviceAccountName`.
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
