import { useApi } from '@backstage/core-plugin-api';
import { GiantSwarmIcon } from '../../assets/icons/CustomIcons';
import { ProviderSettingsItem } from './ProviderSettingsItem';
import { gsAuthProvidersApiRef } from '../../apis/auth';

export const ProviderSettings = () => {
  const gsAuthProvidersApi = useApi(gsAuthProvidersApiRef);

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
