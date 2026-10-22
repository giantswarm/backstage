import { useMemo } from 'react';

import {
  presetsToAsk,
  SIGN_IN_TOOL,
  type SignInTool,
  signInToolOf,
} from '../lib/signInTool';
import { useMusterServers } from './useMusterServers';
import { useToolsetResolution } from './useToolsetResolution';

export type SignInToolState = SignInTool & {
  /** {@link SignInTool.connectors} as people call them. */
  labels: string[];
  /** The connectors' sign-in modes, or a preset's coverage, are still read. */
  isLoading: boolean;
};

/**
 * The sign-in tool a wizard selection needs (`lib/signInTool`), from the
 * installation's MCPServer CRs — how muster signs in to each connector — and,
 * for an installation's own preset in the selection, whether muster resolves
 * it to include the tool. Nothing is added while either is still read.
 */
export function useSignInTool(
  installation: string | undefined,
  selection: string[],
  declined: boolean,
): SignInToolState {
  const { servers, labels, isLoading } = useMusterServers(installation);
  const asked = useMemo(() => presetsToAsk(selection), [selection]);
  const presets = useToolsetResolution(installation, asked);
  const presetsInclude = presets.tools.some(tool => tool.name === SIGN_IN_TOOL);
  const isReading = isLoading || presets.status === 'loading';

  return useMemo(() => {
    const result = isReading
      ? signInToolOf({ selection, servers: [], declined, presetsInclude })
      : signInToolOf({ selection, servers, declined, presetsInclude });
    return {
      ...result,
      labels: result.connectors.map(name => labels.get(name) ?? name),
      isLoading: isReading,
    };
  }, [isReading, selection, servers, declined, presetsInclude, labels]);
}
