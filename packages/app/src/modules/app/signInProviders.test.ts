import { ConfigReader } from '@backstage/config';
import { githubAuthApiRef } from '@backstage/core-plugin-api';
import { gsAuthApiRef } from '@giantswarm/backstage-plugin-gs';
import { signInProviders } from './signInProviders';

describe('signInProviders', () => {
  it('offers the main provider alone when nothing is configured', () => {
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

  it('titles the lone main provider from gs.signInProvider', () => {
    const [provider] = signInProviders(
      new ConfigReader({
        gs: {
          authProvider: 'oidc-gazelle',
          signInProvider: { title: 'Entra ID', message: 'Company login' },
        },
      }),
    );

    expect(provider).toMatchObject({
      title: 'Entra ID',
      message: 'Company login',
    });
  });

  it('lists the configured providers in order with their own texts', () => {
    const providers = signInProviders(
      new ConfigReader({
        gs: {
          authProvider: 'oidc-gazelle',
          signInProviders: [
            {
              id: 'github',
              title: 'GitHub',
              message: 'With your GitHub account',
            },
            { id: 'dex', title: 'Microsoft', message: 'Giant Swarm SSO' },
          ],
        },
      }),
    );

    expect(providers).toEqual([
      {
        id: 'github-auth-provider',
        title: 'GitHub',
        message: 'With your GitHub account',
        apiRef: githubAuthApiRef,
      },
      {
        id: 'dex-auth-provider',
        title: 'Microsoft',
        message: 'Giant Swarm SSO',
        apiRef: gsAuthApiRef,
      },
    ]);
  });

  it('falls back to default texts and skips unknown ids', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const providers = signInProviders(
      new ConfigReader({
        gs: {
          authProvider: 'oidc-gazelle',
          signInProviders: [{ id: 'okta' }, { id: 'github' }],
        },
      }),
    );

    expect(providers).toEqual([
      {
        id: 'github-auth-provider',
        title: 'GitHub',
        message: 'Sign in using GitHub',
        apiRef: githubAuthApiRef,
      },
    ]);
    expect(warn).toHaveBeenCalledWith(
      "Ignoring unknown gs.signInProviders entry 'okta'",
    );
    warn.mockRestore();
  });
});
