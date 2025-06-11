import { ConfigApi } from '@backstage/core-plugin-api';
import { LabelConfig } from './types';

const defaultLabelsConfig: LabelConfig[] = [
  {
    label: 'giantswarm.io/service-priority',
    key: 'Service priority',
    valueMap: {
      highest: 'Highest',
      medium: 'Medium',
      lowest: 'Lowest',
    },
  },
];

export function getLabelsConfig(configApi: ConfigApi) {
  const labelsConfig = configApi.getOptionalConfigArray('gs.friendlyLabels');
  if (!labelsConfig) {
    return defaultLabelsConfig;
  }

  return labelsConfig.map(labelConfig => {
    const valueMapConfig = labelConfig.getOptionalConfig('valueMap');
    const valueMap = valueMapConfig
      ? Object.fromEntries(
          valueMapConfig
            .keys()
            .map(key => [key, valueMapConfig.getString(key)]),
        )
      : undefined;

    return {
      label: labelConfig.getString('label'),
      key: labelConfig.getOptionalString('key'),
      valueMap,
      variant: labelConfig.getOptionalString('variant'),
    };
  });
}
