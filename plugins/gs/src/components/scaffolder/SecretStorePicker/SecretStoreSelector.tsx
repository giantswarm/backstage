import { useMemo } from 'react';
import {
  getSecretStoreName,
  SecretStore,
} from '@giantswarm/backstage-plugin-gs-common';
import { SelectFormField } from '../../UI/SelectFormField';
import { useSecretStores } from '../../hooks';

type SecretStoreSelectorProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  namespace?: string;
  installations: string[];
  selectedSecretStore?: string;
  onChange: (secretStore: SecretStore) => void;
};

export const SecretStoreSelector = ({
  id,
  label,
  helperText,
  required,
  disabled,
  error,
  namespace,
  installations,
  selectedSecretStore,
  onChange,
}: SecretStoreSelectorProps) => {
  const { resources, isLoading, errors } = useSecretStores(
    installations,
    namespace,
  );

  const resourcesMap = useMemo(() => {
    return Object.fromEntries(
      resources.map(resource => {
        const { installationName, ...secretStore } = resource;

        return [getSecretStoreName(secretStore), resource];
      }),
    );
  }, [resources]);
  const secretStoreNames = Object.keys(resourcesMap);

  const isDisabled =
    disabled ||
    installations.length === 0 ||
    isLoading ||
    resources.length === 0;

  let statusText = '';
  if (installations.length === 0) {
    statusText = 'Please select an installation first.';
  } else if (isLoading) {
    statusText = 'Loading list of secret stores...';
  } else if (errors.length > 0) {
    statusText = errors.join(' ');
  } else if (resources.length === 0) {
    statusText = 'No secret stores found for the selected cluster.';
  }

  const handleChange = (selectedItem: string) => {
    const { installationName, ...secretStore } = resourcesMap[selectedItem];

    onChange(secretStore);
  };

  return (
    <SelectFormField
      id={id}
      label={label}
      helperText={statusText ?? helperText}
      required={required}
      disabled={isDisabled}
      error={error || errors.length > 0}
      items={secretStoreNames}
      selectedItem={selectedSecretStore ?? ''}
      onChange={handleChange}
    />
  );
};
