import { useApi } from '@backstage/core-plugin-api';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { musterApiRef } from '../../apis';
import { connectorToolEvent } from '../../lib/connectorToolEvents';
import { useMusterMutationRefresh } from '../MusterInstanceProvider';

/** One call of a muster connector tool, with its arguments. */
export type ConnectorToolCall = {
  tool: string;
  args: Record<string, unknown>;
};

/**
 * Runs a muster connector tool (activate, deactivate, reconnect, delete)
 * through the `/call` proxy route, refetches the reads once it went through,
 * and reports what it did to the connector: the event `useToolRun` reports
 * for the same tool run from its own page.
 */
export function useConnectorToolCall<T extends ConnectorToolCall>(
  installation: string | undefined,
  onDone?: (call: T) => void,
) {
  const musterApi = useApi(musterApiRef);
  const refresh = useMusterMutationRefresh(installation);
  return useTrackedMutation({
    event: (_result, { tool, args }: T) =>
      connectorToolEvent(tool, args) ?? null,
    mutationFn: ({ tool, args }: T) =>
      musterApi.callTool(tool, args, installation),
    onSuccess: (_result, call) => {
      // muster writes the CR synchronously, so refetching now shows the spec
      // change (e.g. the Activate/Deactivate swap) instead of waiting for the
      // next 30s poll.
      refresh();
      onDone?.(call);
    },
  });
}
