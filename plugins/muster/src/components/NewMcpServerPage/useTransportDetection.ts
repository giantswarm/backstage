import { useMemo, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import useDebounce from 'react-use/esm/useDebounce';

import { musterApiRef } from '../../apis';
import { isCompleteMcpUrl } from '../../lib/mcpServerDefinition';
import type { McpServerTransport } from '../../lib/mcpServerDefinition';
import { parseTransportDetection } from '../../lib/transportDetection';
import { useMusterSession } from '../MusterInstanceProvider';

const DETECT_DEBOUNCE_MS = 500;

export type TransportDetectionState = {
  /** The detected transport, when a probe reached a verdict. */
  detected?: McpServerTransport;
  /** Whether a probe is currently in flight. */
  probing: boolean;
};

/**
 * Debounced transport detection for the wizard's details step: once the URL
 * looks complete, muster's `core_mcpserver_detect` probes it from muster's own
 * network position (the browser often can't reach the server, or hits CORS).
 *
 * Detection is strictly best-effort and silent: it needs an authenticated
 * muster session (step 1 doesn't require one, so without it nothing happens),
 * an older muster without the tool makes the call fail, and an inconclusive
 * probe returns `unknown` -- in every one of those cases `detected` stays
 * undefined and the user just picks the transport manually, as before.
 */
export function useTransportDetection(
  url: string,
  installation: string | undefined,
): TransportDetectionState {
  const musterApi = useApi(musterApiRef);
  const { authenticated } = useMusterSession();

  const [debouncedUrl, setDebouncedUrl] = useState(url);
  useDebounce(() => setDebouncedUrl(url), DETECT_DEBOUNCE_MS, [url]);

  const probeUrl = isCompleteMcpUrl(debouncedUrl) ? debouncedUrl.trim() : '';

  const query = useQuery({
    // Keyed by URL so a stale probe's result can never be attributed to a
    // URL typed later -- react-query drops superseded keys on its own.
    queryKey: ['muster', 'transport-detect', installation, probeUrl],
    enabled: Boolean(authenticated && installation && probeUrl),
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      musterApi.callTool(
        'core_mcpserver_detect',
        { url: probeUrl },
        installation,
      ),
  });

  const detection = useMemo(
    () => parseTransportDetection(query.data),
    [query.data],
  );
  const detected =
    detection && detection.transport !== 'unknown'
      ? detection.transport
      : undefined;

  return { detected, probing: query.isFetching };
}
