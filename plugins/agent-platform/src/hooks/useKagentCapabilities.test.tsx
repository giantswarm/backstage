import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi } from '../apis/types';
import { FALLBACK_KAGENT_CAPABILITIES } from '../lib/kagentCapabilities';
import { useKagentCapabilitiesMap } from './useKagentCapabilities';

const getIdentity = jest.fn();

const kagentApi = {
  getIdentity,
  listSessions: jest.fn(),
  listInstallations: jest.fn(),
} as unknown as KagentApi;

function renderWith(installations: string[]) {
  // Retries off so a rejected probe settles immediately.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useKagentCapabilitiesMap(installations), { wrapper });
}

beforeEach(() => {
  getIdentity.mockReset();
});

describe('useKagentCapabilitiesMap', () => {
  it('reports a user-scoped installation once the probe resolves', async () => {
    getIdentity.mockResolvedValue({ sub: 'marian@giantswarm.io' });

    const { result } = renderWith(['gazelle']);

    await waitFor(() =>
      expect(result.current('gazelle').isUserScoped).toBe(true),
    );
  });

  it('flags an installation running kagent in unsecure mode', async () => {
    // unsecure mode ignores the forwarded token and resolves every caller to a
    // shared built-in user, so the list is not "your sessions".
    getIdentity.mockResolvedValue({ sub: 'admin@kagent.dev' });

    const { result } = renderWith(['gazelle']);

    await waitFor(() =>
      expect(result.current('gazelle').isUserScoped).toBe(false),
    );
  });

  it('derives capabilities independently per installation', async () => {
    // The point of keying per installation: each is its own deployment with its
    // own auth mode.
    getIdentity.mockImplementation((installation: string) =>
      Promise.resolve({
        sub:
          installation === 'gazelle'
            ? 'marian@giantswarm.io'
            : 'admin@kagent.dev',
      }),
    );

    const { result } = renderWith(['gazelle', 'golem']);

    await waitFor(() => {
      expect(result.current('gazelle').isUserScoped).toBe(true);
      expect(result.current('golem').isUserScoped).toBe(false);
    });
  });

  it('probes each installation once', async () => {
    getIdentity.mockResolvedValue({ sub: 'marian@giantswarm.io' });

    const { result, rerender } = renderWith(['gazelle', 'golem']);
    await waitFor(() =>
      expect(result.current('gazelle').isUserScoped).toBe(true),
    );
    rerender();
    rerender();

    expect(getIdentity).toHaveBeenCalledTimes(2);
    expect(getIdentity).toHaveBeenCalledWith('gazelle');
    expect(getIdentity).toHaveBeenCalledWith('golem');
  });

  it('claims nothing while the probe is still pending', () => {
    getIdentity.mockReturnValue(new Promise(() => {}));

    const { result } = renderWith(['gazelle']);

    expect(result.current('gazelle').isUserScoped).toBeUndefined();
  });

  it('claims nothing when kagent reports no subject', async () => {
    // Reachable on a healthy deployment: /api/me returns the token's claims
    // verbatim, so an IdP that omits `sub` yields no subject. That is "unknown",
    // not "confirmed shared user" — flagging it would show the very warning this
    // probe exists to avoid.
    getIdentity.mockResolvedValue({ sub: undefined });

    const { result } = renderWith(['gazelle']);

    await waitFor(() => expect(getIdentity).toHaveBeenCalled());
    expect(result.current('gazelle').isUserScoped).toBeUndefined();
  });

  it('keeps a stable callback identity when the array is derived inline', async () => {
    // Callers naturally write `useKagentCapabilitiesMap(reachable.map(...))`,
    // which is a *fresh array on every render*. The memo keys off the outcome
    // signature alone, so downstream memos and effects must not be invalidated by
    // that — note the inline array literal below, which is what makes this a real
    // test rather than one that reuses a single instance.
    getIdentity.mockResolvedValue({ sub: 'marian@giantswarm.io' });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </TestApiProvider>
    );
    const { result, rerender } = renderHook(
      () => useKagentCapabilitiesMap(['gazelle']),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current('gazelle').isUserScoped).toBe(true),
    );

    const before = result.current;
    rerender();

    expect(result.current).toBe(before);
  });

  it('falls back without throwing when the probe fails', async () => {
    // An installation whose kagent is absent or unreachable must degrade, not
    // take the page down.
    getIdentity.mockRejectedValue(new Error('unreachable'));

    const { result } = renderWith(['gazelle']);

    await waitFor(() => expect(getIdentity).toHaveBeenCalled());
    expect(result.current('gazelle').isUserScoped).toBeUndefined();
  });

  it('returns the fallback for an installation it was never given', () => {
    const { result } = renderWith([]);

    expect(result.current('never-heard-of-it')).toEqual(
      FALLBACK_KAGENT_CAPABILITIES,
    );
  });
});
