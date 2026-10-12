import { ConfigReader } from '@backstage/config';
import {
  gsAuthApiRef,
  gsFallbackSignInAuthApiRef,
} from '@giantswarm/backstage-plugin-gs';
import { shellSignInProviders, signInProviders } from './signInProviders';

describe('signInProviders', () => {
  it('offers the main provider alone when nothing else is configured', () => {
    const providers = signInProviders(
      new ConfigReader({ gs: { authProvider: 'oidc-gazelle' } }),
    );

    expect(providers).toEqual([
      {
        id: 'dex-auth-provider',
        title: 'Dex',
        message: 'Sign in using Dex',
        apiRef: gsAuthApiRef,
      },
    ]);
  });

  it('titles the main card from gs.signInProvider', () => {
    const [provider] = signInProviders(
      new ConfigReader({
        gs: {
          authProvider: 'oidc-gazelle',
          signInProvider: { title: 'GitHub', message: 'Giant Swarm SSO' },
        },
      }),
    );

    expect(provider).toMatchObject({
      title: 'GitHub',
      message: 'Giant Swarm SSO',
    });
  });

  it('adds the fallback-connector card after the main one, with its own texts', () => {
    const providers = signInProviders(
      new ConfigReader({
        gs: {
          authProvider: 'oidc-gazelle',
          signInProvider: { title: 'GitHub', message: 'Giant Swarm SSO' },
          signInFallbackProvider: {
            connectorId: 'giantswarm-ad',
            title: 'Microsoft',
            message: 'Entra ID account',
          },
        },
      }),
    );

    expect(providers).toEqual([
      {
        id: 'dex-auth-provider',
        title: 'GitHub',
        message: 'Giant Swarm SSO',
        apiRef: gsAuthApiRef,
      },
      {
        id: 'dex-fallback-auth-provider',
        title: 'Microsoft',
        message: 'Entra ID account',
        apiRef: gsFallbackSignInAuthApiRef,
      },
    ]);
  });

  it('gives the fallback card default texts', () => {
    const [, fallback] = signInProviders(
      new ConfigReader({
        gs: {
          authProvider: 'oidc-gazelle',
          signInFallbackProvider: { connectorId: 'giantswarm-ad' },
        },
      }),
    );

    expect(fallback).toMatchObject({
      title: 'Other identity provider',
      message: 'Sign in through another identity provider',
      apiRef: gsFallbackSignInAuthApiRef,
    });
  });

  it('ignores a fallback block without a connector id', () => {
    const providers = signInProviders(
      new ConfigReader({
        gs: {
          authProvider: 'oidc-gazelle',
          signInFallbackProvider: { title: 'Microsoft' },
        },
      }),
    );

    expect(providers).toHaveLength(1);
    expect(providers[0].apiRef).toBe(gsAuthApiRef);
  });
});

describe('shellSignInProviders', () => {
  it('leaves out the default messages, which repeat the buttons', () => {
    const providers = shellSignInProviders(
      new ConfigReader({
        gs: {
          authProvider: 'oidc-gazelle',
          signInFallbackProvider: { connectorId: 'giantswarm-ad' },
        },
      }),
    );

    expect(providers).toEqual([
      { id: 'dex-auth-provider', title: 'Dex', apiRef: gsAuthApiRef },
      {
        id: 'dex-fallback-auth-provider',
        title: 'Other identity provider',
        apiRef: gsFallbackSignInAuthApiRef,
      },
    ]);
  });

  it('leaves out a configured message that only copies the default', () => {
    const providers = shellSignInProviders(
      new ConfigReader({
        gs: {
          authProvider: 'oidc-gazelle',
          signInProvider: { message: 'Sign in using Dex' },
          signInFallbackProvider: {
            connectorId: 'giantswarm-ad',
            message: 'Sign in through another identity provider',
          },
        },
      }),
    );

    expect(providers.map(provider => provider.message)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('keeps the messages the deployment wrote', () => {
    const providers = shellSignInProviders(
      new ConfigReader({
        gs: {
          authProvider: 'oidc-gazelle',
          signInProvider: { title: 'GitHub', message: 'Giant Swarm SSO' },
          signInFallbackProvider: {
            connectorId: 'giantswarm-ad',
            title: 'Microsoft',
            message: 'Entra ID account',
          },
        },
      }),
    );

    expect(providers.map(provider => provider.message)).toEqual([
      'Giant Swarm SSO',
      'Entra ID account',
    ]);
  });
});
