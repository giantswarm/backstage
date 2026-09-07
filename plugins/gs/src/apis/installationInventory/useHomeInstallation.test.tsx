import { PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { mockApis, TestApiProvider } from '@backstage/frontend-test-utils';
import { configApiRef } from '@backstage/core-plugin-api';
import {
  __resetInstallationsConfigForTests,
  setInstallationsConfig,
} from '../installations';
import {
  findHomeInstallation,
  useHomeInstallation,
} from './useHomeInstallation';

const installations = [
  { name: 'wombat', oidcTokenProvider: 'oidc-wombat' },
  { name: 'golem', authProvider: 'oidc', oidcTokenProvider: 'oidc-golem' },
  { name: 'snail', oidcTokenProvider: 'oidc-snail' },
];

function renderWith(mainProvider: string | undefined) {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [
          configApiRef,
          mockApis.config({
            data: mainProvider ? { gs: { authProvider: mainProvider } } : {},
          }),
        ],
      ]}
    >
      {children}
    </TestApiProvider>
  );
  return renderHook(() => useHomeInstallation(), { wrapper });
}

describe('findHomeInstallation', () => {
  it('is the entry whose oidcTokenProvider is the main sign-in provider', () => {
    expect(findHomeInstallation(installations, 'oidc-golem')?.name).toBe(
      'golem',
    );
  });

  it('is nobody when no entry uses the main provider, or none is configured', () => {
    expect(
      findHomeInstallation(installations, 'oidc-elsewhere'),
    ).toBeUndefined();
    expect(findHomeInstallation(installations, undefined)).toBeUndefined();
  });
});

describe('useHomeInstallation', () => {
  beforeEach(() => __resetInstallationsConfigForTests());
  afterEach(() => __resetInstallationsConfigForTests());

  it('loads until the installations config arrives, then names the home', () => {
    const { result } = renderWith('oidc-golem');

    expect(result.current).toEqual({ home: undefined, isLoading: true });
  });

  it('names the installation signed in with the main provider', () => {
    setInstallationsConfig(installations);

    const { result } = renderWith('oidc-golem');

    expect(result.current.isLoading).toBe(false);
    expect(result.current.home?.name).toBe('golem');
  });

  it('has no home when no installation matches gs.authProvider', () => {
    setInstallationsConfig(installations);

    expect(renderWith('oidc-elsewhere').result.current.home).toBeUndefined();
    expect(renderWith(undefined).result.current.home).toBeUndefined();
  });
});
