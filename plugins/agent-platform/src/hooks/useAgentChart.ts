/**
 * The defaults a new agent starts from.
 *
 * On kagent `main` an agent is an AgentTemplate rather than a release of the
 * `agent` chart, so there is no published chart whose `values.yaml` could seed
 * the form: the default system prompt lives here. The hook keeps its shape (a
 * result the create form reads once it is available) so the form's seeding
 * logic is unchanged; nothing is fetched, so it is never loading.
 */
export type AgentChart = {
  /** The API the composed AgentTemplate is written at. */
  version: string;
  defaultSystemMessage: string;
  isLoading: boolean;
  error: Error | null;
};

export const DEFAULT_SYSTEM_MESSAGE = `You are a helpful assistant for the platform team. Use the tools you are given to
answer from live data rather than from memory, say what you checked, and ask before
changing anything.`;

const AGENT_CHART: AgentChart = {
  version: 'kagent.dev/v1alpha3',
  defaultSystemMessage: DEFAULT_SYSTEM_MESSAGE,
  isLoading: false,
  error: null,
};

export function useAgentChart(): AgentChart {
  return AGENT_CHART;
}
