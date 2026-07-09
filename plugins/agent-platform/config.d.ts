export interface Config {
  /** Configuration for the agent-platform plugin. */
  agentPlatform?: {
    /**
     * Chart the create flow adapts. The `general-purpose-agent` chart does not
     * exist yet, so these are assumptions surfaced as config to make them easy
     * to correct once the chart is published.
     */
    chart?: {
      /**
       * OCI URL of the chart, without a tag
       * (e.g. `oci://gsoci.azurecr.io/giantswarm/charts/general-purpose-agent`).
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
  };
}
