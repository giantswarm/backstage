import React, { useMemo } from 'react';

import {
  ProviderConfig,
  getProviderConfigName,
  Resource,
} from '@internal/plugin-gs-common';
import { SelectFormField } from '../../UI/SelectFormField';
import { useProviderConfigs } from '../../hooks';

type ProviderConfigSelectorProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  installations: string[];
  selectedProviderConfig?: string;
  onChange: (providerConfig: ProviderConfig) => void;
};

export const ProviderConfigSelector = ({
  id,
  label,
  helperText,
  required,
  disabled,
  error,
  installations,
  selectedProviderConfig,
  onChange,
}: ProviderConfigSelectorProps) => {
  const { installationsData, initialLoading } =
    useProviderConfigs(installations);

  const resources: Resource<ProviderConfig>[] = installationsData.flatMap(
    ({ installationName, data }) =>
      data.map(resource => ({ installationName, ...resource })),
  );

  const providerConfigResourcesMap = useMemo(() => {
    return Object.fromEntries(
      resources.map(resource => {
        const { installationName, ...providerConfig } = resource;

        return [getProviderConfigName(providerConfig), resource];
      }),
    );
  }, [resources]);

  const providerConfigRefs = Object.keys(providerConfigResourcesMap);

  const isDisabled = disabled || installations.length === 0 || initialLoading;

  const handleChange = (selectedItem: string) => {
    const { installationName, ...providerConfig } =
      providerConfigResourcesMap[selectedItem];

    onChange(providerConfig);
  };

  return (
    <SelectFormField
      id={id}
      label={label}
      helperText={
        initialLoading ? 'Loading list of provider configs...' : helperText
      }
      required={required}
      disabled={isDisabled}
      error={error}
      items={providerConfigRefs}
      selectedItem={selectedProviderConfig ?? ''}
      onChange={handleChange}
    />
  );
};
