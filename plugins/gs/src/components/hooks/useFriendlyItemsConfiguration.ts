import { configApiRef, useApi } from '@backstage/core-plugin-api';

export const defaultFriendlyLabelsConfiguration = [
  {
    selector: 'giantswarm.io/service-priority',
    key: 'Service priority',
    valueMap: {
      highest: 'Highest',
      medium: 'Medium',
      lowest: 'Lowest',
    },
  },
];

export function useFriendlyItemsConfiguration(configurationKey: string) {
  const configApi = useApi(configApiRef);

  const configsArray = configApi.getOptionalConfigArray(configurationKey);
  if (!configsArray) {
    return undefined;
  }

  return configsArray.map(config => {
    const valueMapConfig = config.getOptionalConfig('valueMap');
    const valueMap = valueMapConfig
      ? Object.fromEntries(
          valueMapConfig
            .keys()
            .map(key => [key, valueMapConfig.getString(key)]),
        )
      : undefined;

    return {
      selector: config.getString('selector'),
      key: config.getOptionalString('key'),
      valueMap,
      variant: config.getOptionalString('variant'),
    };
  });
}
