import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MusterUnauthorizedError } from '@giantswarm/backstage-plugin-muster';

import { PORTAL_SESSION_ENDED_MESSAGE } from '../lib/portalSession';
import { useMusterToolCatalogue } from './useMusterToolCatalogue';
import { useToolsetPresets } from './useToolsetPresets';
import { useToolsetResolution } from './useToolsetResolution';

/**
 * The portal's backend refusing the session token before muster-backend
 * runs: Backstage's `AuthenticationError`, which muster's client keeps as
 * `errorName`.
 */
const portalRefusal = () =>
  new MusterUnauthorizedError(
    'Failed user token verification',
    undefined,
    undefined,
    'gazelle',
    'AuthenticationError',
  );

const mockMusterApi = {
  listTools: jest.fn(),
  filterTools: jest.fn(),
};
jest.mock('./useMusterPluginApi', () => ({
  useMusterPluginApi: () => mockMusterApi,
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// The tool catalogue reads go to muster directly, not through a client of
// this plugin: each says the portal session ended in plain words.
describe('the tool catalogue reads when the portal refuses the session token', () => {
  beforeEach(() => {
    mockMusterApi.listTools.mockReset();
    mockMusterApi.filterTools.mockReset();
    mockMusterApi.listTools.mockRejectedValue(portalRefusal());
    mockMusterApi.filterTools.mockRejectedValue(portalRefusal());
  });

  it('says so on the catalogue', async () => {
    const { result } = renderHook(() => useMusterToolCatalogue('gazelle'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.sessionEnded).toBe(true));
    expect(result.current.error).toBe(PORTAL_SESSION_ENDED_MESSAGE);
  });

  it('says so on a toolset resolution', async () => {
    const { result } = renderHook(
      () => useToolsetResolution('gazelle', ['preset:read-only']),
      { wrapper },
    );

    await waitFor(() => expect(result.current.sessionEnded).toBe(true));
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(PORTAL_SESSION_ENDED_MESSAGE);
  });

  it('says so on the presets', async () => {
    const { result } = renderHook(() => useToolsetPresets('gazelle'), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current.error).toBe(PORTAL_SESSION_ENDED_MESSAGE),
    );
  });
});
