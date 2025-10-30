import { useMemo } from 'react';
import { SelectFormField } from '../../UI/SelectFormField';
import {
  ClusterSecretStore,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';

type ClusterSecretStoreSelectorProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  installations: string[];
  selectedSecretStore?: string;
  onChange: (secretStore: ClusterSecretStore) => void;
};

export const ClusterSecretStoreSelector = ({
  id,
  label,
  helperText,
  required,
  disabled,
  error,
  installations,
  selectedSecretStore,
  onChange,
}: ClusterSecretStoreSelectorProps) => {
  const { resources, isLoading, errors } = useResources(
    installations,
    ClusterSecretStore,
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
    statusText = 'Loading list of cluster secret stores...';
  } else if (errors.length > 0) {
    statusText = errors.join(' ');
  } else if (resources.length === 0) {
    statusText =
      'No cluster secret stores found for the selected installation.';
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
