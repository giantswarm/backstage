import React from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { GiantSwarmIcon } from '../../assets/icons/CustomIcons';
import { ProviderSettingsItem } from './ProviderSettingsItem';
import { gsAuthApiRef } from '../../apis';

export const ProviderSettings = () => {
  const gsAuthApi = useApi(gsAuthApiRef);

  return (
    <>
      {gsAuthApi
        .getProviders()
        .map(({ providerName, providerDisplayName, installationName }) => {
          const authApi = gsAuthApi.getAuthApi(providerName);

          return (
            <>
              {authApi && (
                <ProviderSettingsItem
                  title={providerDisplayName}
                  description={`Provides single sign-on authentication for the Giant Swarm installation "${installationName}"`}
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
