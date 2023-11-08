import {
  useApi,
  configApiRef,
} from '@backstage/core-plugin-api';
import React, { ReactNode } from 'react';

export type ConfigurationAvailableProps = { children: ReactNode } & ({
  configKey: string
});

/**
 * Enables or disables rendering of its children based on the availability of a given
 * configuration key.
 *
 * @public
 */
export const ConfigurationAvailable = (props: ConfigurationAvailableProps) => {
  const { children, configKey } = props;
  const configApi = useApi(configApiRef);
  const isAvailable = Boolean(configApi.getOptional(configKey));

  return <>{isAvailable ? children : null}</>;
};
