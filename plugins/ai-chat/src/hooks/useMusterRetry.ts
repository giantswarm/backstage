import { useCallback } from 'react';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { ResponseError } from '@backstage/errors';
import type {
  MusterInputAnswer,
  MusterToolInputRequired,
} from '@giantswarm/backstage-plugin-gs-common';
import { useMcpAuthHeaders } from './useMcpAuthHeaders';

/**
 * Sends a muster call that asked the person to open a page again, with their
 * answer, and resolves to its output for the model: the tool's result, its
 * error, or another `inputRequired` when muster asks again.
 */
export type MusterRetry = (
  inputRequired: MusterToolInputRequired,
  input: MusterInputAnswer,
) => Promise<unknown>;

export function useMusterRetry(): MusterRetry {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const getMcpAuthHeaders = useMcpAuthHeaders();

  return useCallback(
    async (inputRequired, input) => {
      const baseUrl = await discoveryApi.getBaseUrl('ai-chat');
      const response = await fetchApi.fetch(`${baseUrl}/muster/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getMcpAuthHeaders()),
        },
        body: JSON.stringify({
          tool: inputRequired.tool,
          arguments: inputRequired.arguments,
          input,
        }),
      });
      if (!response.ok) {
        throw await ResponseError.fromResponse(response);
      }
      const { output } = (await response.json()) as { output: unknown };
      return output;
    },
    [discoveryApi, fetchApi, getMcpAuthHeaders],
  );
}
