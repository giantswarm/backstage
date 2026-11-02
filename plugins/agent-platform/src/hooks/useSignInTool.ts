import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { musterToolsetIncludesQueryKey } from '../lib/queryKeys';
import {
  presetsToAsk,
  SIGN_IN_TOOL,
  type SignInTool,
  signInToolOf,
} from '../lib/signInTool';
import { toolsetWasEvaluated } from '../lib/toolset';
import { useMusterPluginApi } from './useMusterPluginApi';
import { useMusterServers } from './useMusterServers';

export type SignInToolState = SignInTool & {
  /** {@link SignInTool.connectors} as people call them. */
  labels: string[];
  /** The connectors' sign-in modes, or a preset's coverage, are still read. */
  isLoading: boolean;
};

/**
 * Whether muster resolves the installation's own presets of a selection to
 * include the sign-in tool: `filter_tools` within those presets for that one
 * name. A muster that does not evaluate toolsets answers its whole catalogue,
 * which says nothing about the presets, so it counts as no.
 */
function usePresetsInclude(
  installation: string | undefined,
  presets: string[],
): { includes: boolean; isLoading: boolean } {
  const musterApi = useMusterPluginApi();
  const enabled =
    Boolean(installation) && Boolean(musterApi) && presets.length > 0;
  const { data, isPending, fetchStatus } = useQuery({
    queryKey: musterToolsetIncludesQueryKey(
      installation ?? '',
      presets,
      SIGN_IN_TOOL,
    ),
    enabled,
    queryFn: () =>
      musterApi!.filterTools({
        installation,
        toolset: presets,
        pattern: SIGN_IN_TOOL,
        limit: 1,
      }),
    retry: false,
  });
  return {
    includes: Boolean(
      data &&
      toolsetWasEvaluated(data) &&
      (data.tools ?? []).some(tool => tool.name === SIGN_IN_TOOL),
    ),
    isLoading: enabled && isAwaitingData({ isPending, fetchStatus }),
  };
}

/**
 * The sign-in tool a wizard selection needs (`lib/signInTool`), from the
 * installation's MCPServer CRs — how muster signs in to each connector — and,
 * for an installation's own preset in the selection, whether muster resolves
 * it to include the tool. Nothing is added while either is still read: the
 * review holds Create and Save until then.
 */
export function useSignInTool(
  installation: string | undefined,
  selection: string[],
  declined: boolean,
): SignInToolState {
  const { servers, labels, isLoading } = useMusterServers(installation);
  const asked = useMemo(() => presetsToAsk(selection), [selection]);
  const presets = usePresetsInclude(installation, asked);
  const isReading = isLoading || presets.isLoading;
  const presetsInclude = presets.includes;

  return useMemo(() => {
    const result = signInToolOf({
      selection,
      servers: isReading ? [] : servers,
      declined,
      presetsInclude,
    });
    return {
      ...result,
      labels: result.connectors.map(name => labels.get(name) ?? name),
      isLoading: isReading,
    };
  }, [isReading, selection, servers, declined, presetsInclude, labels]);
}
