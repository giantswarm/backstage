export interface Config {
  /** Configuration for the agent-platform plugin. */
  agentPlatform?: {
    /**
     * GitOps repository that agent-creation pull requests target, as a full
     * repo URL (e.g. `https://github.com/giantswarm/gitops`). In v1 this is a
     * single configured repo; the create flow does not let the user choose.
     * @visibility frontend
     */
    prTargetRepo?: string;

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
     * Kubernetes namespace the generated HelmRelease/OCIRepository are placed
     * in and where the agent runs.
     * @visibility frontend
     */
    namespace?: string;
  };
}
