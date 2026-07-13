// The system prompt a freshly-created agent starts from is not hardcoded here:
// it is pulled from the chart's default `agent.systemMessage` at runtime (see
// useAgentChart), so the create flow tracks the published chart.

// The `agent` chart (github.com/giantswarm/agent), published at
// oci://gsoci.azurecr.io/charts/giantswarm/agent. These are the fallbacks when
// config (`agentPlatform.chart.*`) is absent; the version here is only a floor —
// the create flow resolves the latest published tag at runtime.
// The namespace is not here: it is derived from the selected ModelConfig's
// namespace (the chart references the ModelConfig by name and resolves it in
// the agent's own namespace, so the agent must live alongside it).
export const CHART_DEFAULTS = {
  ociUrl: 'oci://gsoci.azurecr.io/charts/giantswarm/agent',
  version: '0.1.0',
} as const;
