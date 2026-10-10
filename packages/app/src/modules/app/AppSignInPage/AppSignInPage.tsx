import { useMemo } from 'react';
import { ProxiedSignInPage, SignInPage } from '@backstage/core-components';
import {
  configApiRef,
  type IdentityApi,
  useApi,
} from '@backstage/core-plugin-api';
import { readPortals } from '@giantswarm/backstage-plugin-agent-platform-common';
import { ShellSignInPage } from '../../agentShell/ShellSignInPage';
import { signInProviders } from '../signInProviders';

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
  const providers = useMemo(
    () =>
      configApi.has('gs.authProvider') ? signInProviders(configApi) : undefined,
    [configApi],
  );

  if (!providers) {
    return <ProxiedSignInPage {...props} provider="guest" />;
  }
  if (readPortals(configApi).agentPlatform) {
    return <ShellSignInPage {...props} providers={providers} />;
  }
  // One option signs in automatically (existing session, else
  // an instant popup). Several show the chooser; an existing
  // session with any of them is still picked up silently.
  return (
    <SignInPage
      {...props}
      auto={providers.length === 1}
      providers={providers}
    />
  );
}
