import { useCallback, useState } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { musterApiRef } from '../../apis';
import { WORKFLOW_TOOL_PREFIX } from '../../lib/workflowReferences';

/** A call's outcome as the Result section shows it. */
export type CallResult = { result: unknown; durationMs: number };

/** One tool's runs: start one, and what the last one returned. */
export type ToolRun = {
  /** Calls the tool with the arguments. */
  run: (args: Record<string, unknown>) => void;
  /** Calls it again with the last run's arguments. */
  rerun: () => void;
  isPending: boolean;
  /** Why the last run failed; null after one that returned. */
  error: Error | null;
  /**
   * The last run that returned, kept while a re-run is pending: the result
   * is most of the page, and dropping it would collapse the page under the
   * reader until the call returns. Cleared by a failed run, which would
   * otherwise read as its result.
   */
  lastResult?: CallResult;
};

/**
 * Runs one tool through muster's `call_tool` proxy, and reports the run
 * where it is a tracked action: every way of running a tool goes through
 * here, the tool page's form and a workflow's Run it tab. The state lives
 * with the caller, so a page that keeps it above its tabs keeps a run in
 * flight, and its result, across a tab switch.
 *
 * The UI executes whatever tools muster exposes; the trust boundary is the
 * downstream MCP server's deployment (e.g. mcp-kubernetes is deployed
 * read-only), not the portal.
 */
export function useToolRun(
  name: string,
  installation: string | undefined,
  {
    onRan,
  }: {
    /**
     * Called once each run ends, returned or failed: a workflow records a
     * failed run too, so its run records are worth re-reading either way.
     */
    onRan?: () => void;
  } = {},
): ToolRun {
  const musterApi = useApi(musterApiRef);
  const [lastResult, setLastResult] = useState<CallResult | undefined>();
  const [lastArgs, setLastArgs] = useState<Record<string, unknown>>({});

  const mutation = useTrackedMutation({
    // muster runs a workflow as its `workflow_<name>` tool, so a run of one
    // is reported, without its inputs, however it was started. Any other
    // tool call is a probe from the explorer, and its arguments free text.
    event: () =>
      name.startsWith(WORKFLOW_TOOL_PREFIX)
        ? { name: 'Muster.workflowRan', attributes: {} }
        : null,
    mutationFn: async (args: Record<string, unknown>) => {
      const startedAt = performance.now();
      const result = await musterApi.callTool(name, args, installation);
      return { result, durationMs: Math.round(performance.now() - startedAt) };
    },
    onSuccess: setLastResult,
    onError: () => setLastResult(undefined),
    onSettled: () => onRan?.(),
  });

  const { mutate } = mutation;
  const run = useCallback(
    (args: Record<string, unknown>) => {
      setLastArgs(args);
      mutate(args);
    },
    [mutate],
  );

  return {
    run,
    rerun: () => run(lastArgs),
    isPending: mutation.isPending,
    error: mutation.error,
    lastResult,
  };
}
