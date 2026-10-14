import { useMemo } from 'react';
import { ProxiedSignInPage, SignInPage } from '@backstage/core-components';
import {
  configApiRef,
  type IdentityApi,
  useApi,
} from '@backstage/core-plugin-api';
import { readPortals } from '@giantswarm/backstage-plugin-agent-platform-common';
import { ShellSignInPage } from '../../agentShell/ShellSignInPage';
import { shellSignInProviders, signInProviders } from '../signInProviders';

/**
 * The portal's sign-in page.
 *
 * Without `gs.authProvider` (local development) the guest provider signs in
 * through the proxy, without a page. Otherwise the person picks one of
 * {@link signInProviders}: on a deployment that serves the Agent Platform
 * (`app.portals.agentPlatform`, public config, so known before sign-in) in the
 * shell's style, on a classic-only deployment on upstream's `SignInPage`
 * exactly as before. The person's own `agent-platform-shell` opt-in does not
 * count here: a classic deployment's sign-in stays classic for everyone.
 */
export function AppSignInPage(props: {
  onSignInSuccess: (identityApi: IdentityApi) => void;
}) {
  const configApi = useApi(configApiRef);
  const page = useMemo(() => {
    if (!configApi.has('gs.authProvider')) {
      return undefined;
    }
    return readPortals(configApi).agentPlatform
      ? { shell: true as const, providers: shellSignInProviders(configApi) }
      : { shell: false as const, providers: signInProviders(configApi) };
  }, [configApi]);

  if (!page) {
    return <ProxiedSignInPage {...props} provider="guest" />;
  }
  if (page.shell) {
    return <ShellSignInPage {...props} providers={page.providers} />;
  }
  // One option signs in automatically (existing session, else
  // an instant popup). Several show the chooser; an existing
  // session with any of them is still picked up silently.
  return (
    <SignInPage
      {...props}
      auto={page.providers.length === 1}
      providers={page.providers}
    />
  );
}
