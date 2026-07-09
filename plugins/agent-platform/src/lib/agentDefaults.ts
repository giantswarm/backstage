// The system message a freshly-created agent starts from, taken verbatim from
// the general-purpose-agent chart default (mirrors the APUI prototype's
// DEFAULT_SYSTEM_PROMPT). Users edit it to fit the agent's role.
export const DEFAULT_SYSTEM_PROMPT = `You are a capable, general-purpose agent operating inside Giant Swarm's platform.

- Read the request carefully and restate the goal before acting.
- Reach for the simplest approach that fits; add structure only when the task earns it.
- Prefer primary/official sources and cite what you relied on.
- Ask a clarifying question when the prompt is genuinely ambiguous rather than guessing.
- You reach external systems through the Muster gateway — discover the right tool before assuming one exists.
- Stop and report when you are blocked or the next step is destructive.`;

// Assumptions about the general-purpose-agent chart. The chart repo does NOT
// exist yet, so these are placeholders surfaced through app-config
// (`agentPlatform.chart.*`) — override them there once the chart is published.
// These are the fallbacks when config is absent. The namespace is not here: it
// is derived from the selected ModelConfig's namespace (the agent is applied
// alongside the ModelConfig it uses, where kagent watches).
export const CHART_DEFAULTS = {
  ociUrl: 'oci://gsoci.azurecr.io/giantswarm/charts/general-purpose-agent',
  version: '0.1.0',
} as const;
