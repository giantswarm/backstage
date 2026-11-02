import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';

import { musterApiRef } from '../../apis';
import { useTransportDetection } from './useTransportDetection';

let mockAuthenticated = true;
jest.mock('../MusterInstanceProvider', () => ({
  useMusterSession: () => ({ authenticated: mockAuthenticated }),
}));

const callTool = jest.fn();

function renderProbe(url: string, installation: string | undefined) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider apis={[[musterApiRef, { callTool } as never]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useTransportDetection(url, installation), {
    wrapper,
  });
}

beforeEach(() => {
  mockAuthenticated = true;
  callTool.mockReset();
});

describe('useTransportDetection', () => {
  it('probes a complete URL through muster and reports the transport', async () => {
    callTool.mockResolvedValue({
      transport: 'sse',
      reachable: true,
      requiresAuth: false,
    });
    const { result } = renderProbe('https://legacy.example.com/sse', 'gazelle');

    await waitFor(() => expect(result.current.detected).toBe('sse'), {
      timeout: 3000,
    });
    expect(callTool).toHaveBeenCalledWith(
      'core_mcpserver_detect',
      { url: 'https://legacy.example.com/sse' },
      'gazelle',
    );
    expect(result.current.probedUrl).toBe('https://legacy.example.com/sse');
  });

  it('reports nothing for an inconclusive probe', async () => {
    callTool.mockResolvedValue({ transport: 'unknown', reachable: false });
    const { result } = renderProbe('https://down.example.com/mcp', 'gazelle');

    await waitFor(() => expect(callTool).toHaveBeenCalled(), {
      timeout: 3000,
    });
    await waitFor(() => expect(result.current.probing).toBe(false));
    expect(result.current.detected).toBeUndefined();
  });

  it('reports nothing when muster lacks the detect tool', async () => {
    callTool.mockRejectedValue(
      new Error('Tool execution failed: unknown tool: mcpserver_detect'),
    );
    const { result } = renderProbe(
      'https://weather.example.com/mcp',
      'gazelle',
    );

    await waitFor(() => expect(callTool).toHaveBeenCalled(), {
      timeout: 3000,
    });
    await waitFor(() => expect(result.current.probing).toBe(false));
    expect(result.current.detected).toBeUndefined();
  });

  it('does not probe without a muster session or a complete URL', async () => {
    mockAuthenticated = false;
    renderProbe('https://weather.example.com/mcp', 'gazelle');
    mockAuthenticated = true;
    renderProbe('weather', 'gazelle');

    // Past the debounce: nothing was asked.
    await new Promise(resolve => setTimeout(resolve, 700));
    expect(callTool).not.toHaveBeenCalled();
  });
});
