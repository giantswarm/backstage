import {
  ApiRef,
  ConfigApi,
  githubAuthApiRef,
  ProfileInfoApi,
  BackstageIdentityApi,
  SessionApi,
} from '@backstage/core-plugin-api';
import { gsAuthApiRef } from '@giantswarm/backstage-plugin-gs';

/** Shape of one `SignInPage` provider entry (`@backstage/core-components`). */
export interface SignInProviderConfig {
  id: string;
  title: string;
  message: string;
  apiRef: ApiRef<ProfileInfoApi & BackstageIdentityApi & SessionApi>;
}

/**
 * Sign-in options for the login page, in the configured order.
 *
 * `gs.signInProviders` lists them: `dex` is the main OIDC login provider
 * (`gs.authProvider`, Dex on the Giant Swarm fleet), `github` the portal's
 * `auth.providers.github` provider. Both resolve to the same catalog user,
 * so which one a person picks only changes which upstream session the
 * portal holds. Without the list the page offers the main provider alone,
 * titled via `gs.signInProvider` as before.
 */
export function signInProviders(configApi: ConfigApi): SignInProviderConfig[] {
  const dex = (title?: string, message?: string): SignInProviderConfig => ({
    id: 'dex-auth-provider',
    title:
      title ?? configApi.getOptionalString('gs.signInProvider.title') ?? 'Dex',
    message:
      message ??
      configApi.getOptionalString('gs.signInProvider.message') ??
      'Sign in using Dex',
    apiRef: gsAuthApiRef,
  });
  const github = (title?: string, message?: string): SignInProviderConfig => ({
    id: 'github-auth-provider',
    title: title ?? 'GitHub',
    message: message ?? 'Sign in using GitHub',
    apiRef: githubAuthApiRef,
  });

  const configured = configApi.getOptionalConfigArray('gs.signInProviders');
  const providers = (configured ?? []).flatMap(entry => {
    const id = entry.getString('id');
    const title = entry.getOptionalString('title');
    const message = entry.getOptionalString('message');
    if (id === 'dex') {
      return [dex(title, message)];
    }
    if (id === 'github') {
      return [github(title, message)];
    }
    // eslint-disable-next-line no-console
    console.warn(`Ignoring unknown gs.signInProviders entry '${id}'`);
    return [];
  });

  return providers.length > 0 ? providers : [dex()];
}
