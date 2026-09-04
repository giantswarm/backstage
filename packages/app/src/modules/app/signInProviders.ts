import {
  ApiRef,
  ConfigApi,
  ProfileInfoApi,
  BackstageIdentityApi,
  SessionApi,
} from '@backstage/core-plugin-api';
import {
  gsAuthApiRef,
  gsFallbackSignInAuthApiRef,
} from '@giantswarm/backstage-plugin-gs';

/** Shape of one `SignInPage` provider entry (`@backstage/core-components`). */
export interface SignInProviderConfig {
  id: string;
  title: string;
  message: string;
  apiRef: ApiRef<ProfileInfoApi & BackstageIdentityApi & SessionApi>;
}

/**
 * Sign-in cards of the login page. The portal signs in through one OIDC
 * login provider only (`gs.authProvider`, Dex on the Giant Swarm fleet); the
 * cards differ in the Dex connector they lead to:
 *
 * - the main card (titled via `gs.signInProvider`) uses the deployment's
 *   default connector, and
 * - when `gs.signInFallbackProvider.connectorId` is set, a second card signs
 *   in through the same provider pinned to that connector, for people the
 *   default one cannot authenticate.
 *
 * Both cards yield the same portal session. Without a fallback the page
 * offers the main card alone.
 *
 * A sign-in through the fallback card is remembered for this browser: the
 * main provider's later silent re-login popups (AI chat, cluster access,
 * muster) return to that connector. Picking the main card, or signing out,
 * forgets it, so the main card always leads where its title says.
 */
export function signInProviders(configApi: ConfigApi): SignInProviderConfig[] {
  const main: SignInProviderConfig = {
    id: 'dex-auth-provider',
    title: configApi.getOptionalString('gs.signInProvider.title') ?? 'Dex',
    message:
      configApi.getOptionalString('gs.signInProvider.message') ??
      'Sign in using Dex',
    apiRef: gsAuthApiRef,
  };

  const fallback = configApi.getOptionalConfig('gs.signInFallbackProvider');
  if (!fallback?.getOptionalString('connectorId')) {
    return [main];
  }

  return [
    main,
    {
      id: 'dex-fallback-auth-provider',
      title: fallback.getOptionalString('title') ?? 'Other identity provider',
      message:
        fallback.getOptionalString('message') ??
        'Sign in through another identity provider',
      apiRef: gsFallbackSignInAuthApiRef,
    },
  ];
}
