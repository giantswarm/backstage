import { useApi, configApiRef } from '@backstage/core-plugin-api';

export function useApiVersionOverrides(installations: string[]) {
  const configApi = useApi(configApiRef);
  const installationsConfig = configApi.getOptionalConfig('gs.installations');
  if (!installationsConfig) {
    throw new Error(`Missing gs.installations configuration`);
  }

  return Object.fromEntries(
    installations.map(installationName => {
      const apiVersionOverridesConfig = installationsConfig.getOptionalConfig(
        `${installationName}.apiVersionOverrides`,
      );
      const apiVersionOverrides = apiVersionOverridesConfig
        ? Object.fromEntries(
            apiVersionOverridesConfig
              .keys()
              .map(key => [key, apiVersionOverridesConfig.getString(key)]),
          )
        : {};

      return [installationName, apiVersionOverrides];
    }),
  );
}

export function useApiVersionOverride(
  installationName: string,
  resourceNames: { plural: string },
): string | undefined {
  return useApiVersionOverrides([installationName])[installationName]?.[
    resourceNames.plural
  ];
}
