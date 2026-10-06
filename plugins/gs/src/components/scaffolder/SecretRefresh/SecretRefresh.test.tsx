import { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import {
  SecretsContextProvider,
  useTemplateSecrets,
} from '@backstage/plugin-scaffolder-react';
import {
  SecretRefresher,
  TemplateSecretRefreshProvider,
  useRefreshTemplateSecrets,
  useRegisterSecretRefresher,
} from './SecretRefresh';

function wrapper({ children }: PropsWithChildren<{}>) {
  return (
    <SecretsContextProvider>
      <TemplateSecretRefreshProvider>{children}</TemplateSecretRefreshProvider>
    </SecretsContextProvider>
  );
}

type Props = { field?: { key: string; refresh: SecretRefresher } };

function useHarness({ field }: Props) {
  useRegisterSecretRefresher(field?.key, field?.refresh);
  return {
    refreshAll: useRefreshTemplateSecrets(),
    secrets: useTemplateSecrets().secrets,
  };
}

async function refreshInAct(refreshAll: () => Promise<Record<string, string>>) {
  let fresh: Record<string, string> = {};
  await act(async () => {
    fresh = await refreshAll();
  });
  return fresh;
}

describe('SecretRefresh', () => {
  it('refreshes a registered secret after its field has gone away', async () => {
    const refresh = jest.fn().mockResolvedValue('fresh-token');
    const { result, rerender } = renderHook(
      (props: Props) => useHarness(props),
      {
        wrapper,
        initialProps: { field: { key: 'USER_OIDC_TOKEN', refresh } } as Props,
      },
    );
    rerender({});

    const fresh = await refreshInAct(result.current.refreshAll);

    expect(fresh).toEqual({ USER_OIDC_TOKEN: 'fresh-token' });
    expect(result.current.secrets).toEqual({ USER_OIDC_TOKEN: 'fresh-token' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('uses the latest registration for a key', async () => {
    const first = jest.fn().mockResolvedValue('first');
    const second = jest.fn().mockResolvedValue('second');
    const { result, rerender } = renderHook(
      (props: Props) => useHarness(props),
      {
        wrapper,
        initialProps: { field: { key: 'TOKEN', refresh: first } },
      },
    );
    rerender({ field: { key: 'TOKEN', refresh: second } });

    await expect(refreshInAct(result.current.refreshAll)).resolves.toEqual({
      TOKEN: 'second',
    });
    expect(first).not.toHaveBeenCalled();
  });

  it('rejects when a refresher fails', async () => {
    const error = new Error('session expired');
    const { result } = renderHook((props: Props) => useHarness(props), {
      wrapper,
      initialProps: {
        field: { key: 'TOKEN', refresh: () => Promise.reject(error) },
      },
    });

    await expect(refreshInAct(result.current.refreshAll)).rejects.toBe(error);
  });

  it('does nothing outside a provider', async () => {
    const refresh = jest.fn().mockResolvedValue('fresh-token');
    const { result } = renderHook((props: Props) => useHarness(props), {
      wrapper: SecretsContextProvider,
      initialProps: { field: { key: 'TOKEN', refresh } },
    });

    await expect(result.current.refreshAll()).resolves.toEqual({});
    expect(refresh).not.toHaveBeenCalled();
  });
});
