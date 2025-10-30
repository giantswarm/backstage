import { useMemo } from 'react';
import { SelectFormField } from '../../UI/SelectFormField';
import {
  SecretStore,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';

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
  const { resources, isLoading, errors } = useResources(
    installations,
    SecretStore,
    Object.fromEntries(
      installations.map(installation => [installation, { namespace }]),
    ),
  );

  const resourcesMap = useMemo(() => {
    return Object.fromEntries(
      resources.map(resource => {
        return [resource.getName(), resource];
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
    const secretStore = resourcesMap[selectedItem];

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
