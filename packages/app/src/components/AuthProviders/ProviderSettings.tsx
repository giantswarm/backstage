import Star from '@material-ui/icons/Star';
import React from 'react';

import { configApiRef, githubAuthApiRef, useApi } from '@backstage/core-plugin-api';
import { ProviderSettingsItem } from '@backstage/plugin-user-settings';
import { dexAuthApiRef } from '../../apis';

export const ProviderSettings = () => {
  const configApi = useApi(configApiRef);
  const providersConfig = configApi.getOptionalConfig('auth.providers');
  const configuredProviders = providersConfig?.keys() || [];

  return (
    <>
      {configuredProviders.includes('github') && (
        <ProviderSettingsItem
          title="GitHub"
          description="Provides authentication towards GitHub APIs"
          apiRef={githubAuthApiRef}
          icon={Star}
        />
      )}
      {configuredProviders.includes('oidc') && (
        <ProviderSettingsItem
          title="Dex on snail"
          description="Provides authentication towards Dex on snail"
          apiRef={dexAuthApiRef}
          icon={Star}
        />
      )}
    </>
  );
};
