import { useApi, configApiRef } from '@backstage/core-plugin-api';
import { ReactNode } from 'react';

export type FeatureEnabledProps = { children: ReactNode } & {
  feature: string;
};

/**
 * Enables or disables rendering of its children based on the availability of a given
 * feature.
 *
 * @public
 */
export const FeatureEnabled = (props: FeatureEnabledProps) => {
  const { children, feature } = props;
  const configApi = useApi(configApiRef);
  const featureConfig = configApi.getOptionalConfig(`gs.features.${feature}`);
  if (!featureConfig) {
    return null;
  }

  return featureConfig.getBoolean('enabled') ? children : null;
};
