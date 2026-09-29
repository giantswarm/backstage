import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

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

/**
 * The `gs.friendlyLabels` or `gs.friendlyAnnotations` list of the signed-in
 * config, or undefined while the config has not loaded or the key is unset.
 */
export function useFriendlyItemsConfiguration(configurationKey: string) {
  const { config } = useSignedInConfig();

  const configsArray = config?.getOptionalConfigArray(configurationKey);
  if (!configsArray) {
    return undefined;
  }

  return configsArray.map(itemConfig => {
    const valueMapConfig = itemConfig.getOptionalConfig('valueMap');
    const valueMap = valueMapConfig
      ? Object.fromEntries(
          valueMapConfig
            .keys()
            .map(key => [key, valueMapConfig.getString(key)]),
        )
      : undefined;

    return {
      selector: itemConfig.getString('selector'),
      key: itemConfig.getOptionalString('key'),
      valueMap,
      variant: itemConfig.getOptionalString('variant'),
    };
  });
}
