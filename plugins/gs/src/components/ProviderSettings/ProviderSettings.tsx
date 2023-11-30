import React from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { GiantSwarmIcon } from '../../assets/icons/CustomIcons';
import { ProviderSettingsItem } from './ProviderSettingsItem';
import { getProviderDisplayName, getProviderInstallationName, gsAuthApiRefs, isGSProvider } from '../../apis/auth';

export const ProviderSettings = () => {
  const configApi = useApi(configApiRef);
  const providersConfig = configApi.getOptionalConfig('auth.providers');
  const configuredProviders = providersConfig?.keys() || [];
  const gsProviders = configuredProviders.filter(isGSProvider);

  return (
    <>
      {gsProviders.map((providerName) => {
        const displayName = getProviderDisplayName(providerName);
        const installationName = getProviderInstallationName(providerName);
        const apiRef = gsAuthApiRefs[providerName];

        return (
          <>
            {apiRef && (
              <ProviderSettingsItem
                title={displayName}
                description={`Provides single sign-on authentication for the Giant Swarm installation "${installationName}"`}
                apiRef={apiRef}
                icon={GiantSwarmIcon}
              />
            )}
          </>
        );
      })}
    </>
  );
};
