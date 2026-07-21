import { useEffect, useState } from 'react';
import { errorApiRef, useApi } from '@backstage/core-plugin-api';
import { GiantSwarmIcon } from '../../assets/icons/CustomIcons';
import { ProviderSettingsItem } from './ProviderSettingsItem';
import { gsAuthProvidersApiRef } from '../../apis/auth';

export const ProviderSettings = () => {
  const gsAuthProvidersApi = useApi(gsAuthProvidersApiRef);
  const errorApi = useApi(errorApiRef);

  // The per-installation providers are built lazily once the installations
  // config has loaded (post sign-in). Wait for that so the settings list is
  // populated rather than empty on first render.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    gsAuthProvidersApi.ensureInitialized().then(
      () => {
        if (!cancelled) {
          setReady(true);
        }
      },
      error => {
        // Do not swallow the failure: `ready` stays false and the list renders
        // empty, which is indistinguishable from "no providers" unless we report
        // why initialization never completed.
        errorApi.post(error as Error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gsAuthProvidersApi, errorApi]);

  if (!ready) {
    return null;
  }

  return (
    <>
      {gsAuthProvidersApi
        .getProviders()
        .map(({ providerName, providerDisplayName, installationName }) => {
          const authApi = gsAuthProvidersApi.getAuthApi(providerName);

          return (
            <>
              {authApi && (
                <ProviderSettingsItem
                  title={providerDisplayName}
                  description={
                    providerName.startsWith('mcp-')
                      ? `Provides single sign-on authentication for the MCP server`
                      : `Provides single sign-on authentication for the Giant Swarm installation "${installationName}"`
                  }
                  authApi={authApi}
                  icon={GiantSwarmIcon}
                />
              )}
            </>
          );
        })}
    </>
  );
};
