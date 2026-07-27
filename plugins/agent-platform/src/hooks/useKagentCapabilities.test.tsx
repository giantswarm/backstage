import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi } from '../apis/types';
import { FALLBACK_KAGENT_CAPABILITIES } from '../lib/kagentCapabilities';
import { useKagentCapabilitiesMap } from './useKagentCapabilities';

const getVersion = jest.fn();
const getIdentity = jest.fn();

const kagentApi = {
  getVersion,
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

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  getVersion.mockReset();
  getIdentity.mockReset();
  getIdentity.mockResolvedValue({ sub: 'marian@giantswarm.io' });
  // eslint-disable-next-line no-console
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useKagentCapabilitiesMap', () => {
  it('derives capabilities per installation from each version', async () => {
    // The point of keying per installation: the fleet can run mixed versions.
    getVersion.mockImplementation((installation: string) =>
      Promise.resolve(installation === 'gazelle' ? '0.9.9' : 'v0.10.0-beta9'),
    );

    const { result } = renderWith(['gazelle', 'golem']);

    await waitFor(() => {
      expect(result.current('gazelle').version).toBe('0.9.9');
      expect(result.current('golem').version).toBe('0.10.0');
    });

    expect(result.current('gazelle').hasSessionShares).toBe(false);
    expect(result.current('golem').hasSessionShares).toBe(true);
  });

  it('probes each installation once', async () => {
    getVersion.mockResolvedValue('0.9.9');

    const { result, rerender } = renderWith(['gazelle', 'golem']);
    await waitFor(() =>
      expect(result.current('gazelle').version).toBe('0.9.9'),
    );
    rerender();
    rerender();

    expect(getVersion).toHaveBeenCalledTimes(2);
    expect(getVersion).toHaveBeenCalledWith('gazelle');
    expect(getVersion).toHaveBeenCalledWith('golem');
  });

  it('falls back without throwing when the version probe fails', async () => {
    // An installation whose kagent is absent or unreachable must degrade, not
    // take the page down.
    getVersion.mockRejectedValue(new Error('unreachable'));

    const { result } = renderWith(['gazelle']);

    await waitFor(() => {
      expect(result.current('gazelle').isUserScoped).toBeDefined();
    });
    expect(result.current('gazelle')).toMatchObject({
      version: undefined,
      hasSessionShares: false,
      canRenameSessionViaPatch: false,
    });
  });

  it('returns the fallback for an installation it was never given', () => {
    const { result } = renderWith([]);

    expect(result.current('never-heard-of-it')).toEqual(
      FALLBACK_KAGENT_CAPABILITIES,
    );
  });

  it('reports a user-scoped installation once the identity probe resolves', async () => {
    getVersion.mockResolvedValue('0.9.9');
    getIdentity.mockResolvedValue({ sub: 'marian@giantswarm.io' });

    const { result } = renderWith(['gazelle']);

    await waitFor(() =>
      expect(result.current('gazelle').isUserScoped).toBe(true),
    );
  });

  it('flags an installation running kagent in unsecure mode as not user-scoped', async () => {
    // unsecure mode ignores the forwarded token and resolves every caller to a
    // shared built-in user, so the list is not "your sessions".
    getVersion.mockResolvedValue('0.9.9');
    getIdentity.mockResolvedValue({ sub: 'admin@kagent.dev' });

    const { result } = renderWith(['gazelle']);

    await waitFor(() =>
      expect(result.current('gazelle').isUserScoped).toBe(false),
    );
  });

  it('warns once for a version above the tested ceiling', async () => {
    getVersion.mockResolvedValue('0.99.0');

    const { result, rerender } = renderWith(['bleeding-edge']);
    await waitFor(() =>
      expect(result.current('bleeding-edge').isAboveTestedCeiling).toBe(true),
    );
    rerender();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    // Still fully usable — optimistic, not blocked.
    expect(result.current('bleeding-edge').hasSessionShares).toBe(true);
  });
});
