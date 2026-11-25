import { useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { musterApiRef, type MusterApi } from '../../../apis';
import { isMusterAuthError } from '../../../lib/authError';
import {
  CONNECTOR_CONNECT_TOOL,
  CONNECTOR_UPDATE_TOOL,
  connectorEditWrites,
  editTakesArgument,
  type WriteToolSchema,
} from '../../../lib/connectorWrites';
import { toolArgumentsQuery } from './useToolTakesArgument';

/**
 * `core_mcpserver_connect`'s input schema, or undefined on a muster that has
 * no such tool (one write, `core_mcpserver_update`, takes everything there).
 * A read that fails for another reason reads the same way: the one update
 * then carries the connection fields, and a muster that has `connect` refuses
 * them before it writes anything, naming `connect`. A refused sign-in is
 * thrown, as everywhere.
 */
export async function connectToolSchema(
  queryClient: QueryClient,
  musterApi: MusterApi,
  installation: string | undefined,
): Promise<WriteToolSchema | undefined> {
  try {
    const detail = await queryClient.fetchQuery(
      toolArgumentsQuery(musterApi, CONNECTOR_CONNECT_TOOL, installation),
    );
    return detail.inputSchema ?? {};
  } catch (error) {
    if (isMusterAuthError(error)) {
      throw error;
    }
    return undefined;
  }
}

/**
 * Writes an edit of a registered connector through muster's split write tools
 * ({@link connectorEditWrites}): the connection through
 * `core_mcpserver_connect`, the rest through `core_mcpserver_update`. When
 * the second write fails after the first went through, the error says which
 * part was saved, so the person does not take the whole edit for lost.
 * Resolves to the last call's result.
 */
export async function writeConnectorEdit(
  queryClient: QueryClient,
  musterApi: MusterApi,
  args: Record<string, unknown>,
  installation: string | undefined,
): Promise<unknown> {
  const writes = connectorEditWrites(
    args,
    await connectToolSchema(queryClient, musterApi, installation),
  );
  let result: unknown;
  for (const [index, write] of writes.entries()) {
    try {
      result = await musterApi.callTool(write.tool, write.args, installation);
    } catch (error) {
      if (index === 0 || isMusterAuthError(error)) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `The connection settings were saved, but the rest of the edit (${Object.keys(
          write.args,
        )
          .filter(key => key !== 'name')
          .join(', ')}) was not: ${message}`,
      );
    }
  }
  return result;
}

/** {@link writeConnectorEdit} against `installation`, for a save callback. */
export function useConnectorEditWrite(
  installation: string | undefined,
): (args: Record<string, unknown>) => Promise<unknown> {
  const musterApi = useApi(musterApiRef);
  const queryClient = useQueryClient();
  return useCallback(
    (args: Record<string, unknown>) =>
      writeConnectorEdit(queryClient, musterApi, args, installation),
    [queryClient, musterApi, installation],
  );
}

/**
 * Whether an edit of a connector can carry `argument`: `core_mcpserver_connect`
 * takes it, or the one `core_mcpserver_update` of an older muster does.
 * Undefined until muster says.
 */
export function useEditArgumentSupport(
  installation: string | undefined,
  argument: string,
  { enabled = true }: { enabled?: boolean } = {},
): boolean | undefined {
  const musterApi = useApi(musterApiRef);
  const on = enabled && Boolean(installation);
  const update = useQuery({
    ...toolArgumentsQuery(musterApi, CONNECTOR_UPDATE_TOOL, installation),
    enabled: on,
  });
  const connect = useQuery({
    ...toolArgumentsQuery(musterApi, CONNECTOR_CONNECT_TOOL, installation),
    enabled: on,
  });
  let connectSchema: WriteToolSchema | null | undefined;
  if (connect.isSuccess) {
    connectSchema = connect.data.inputSchema ?? {};
  } else if (connect.isError) {
    connectSchema = null;
  }
  return editTakesArgument(argument, {
    update: update.isSuccess ? (update.data.inputSchema ?? {}) : undefined,
    connect: connectSchema,
  });
}
