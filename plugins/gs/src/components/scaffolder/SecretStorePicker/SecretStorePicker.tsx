import { Grid } from '@material-ui/core';
import { SecretStorePickerProps } from './schema';
import { ClusterSecretStoreSelector } from './ClusterSecretStoreSelector';
import { SecretStoreSelector } from './SecretStoreSelector';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import {
  ClusterSecretStore,
  SecretStore,
} from '@giantswarm/backstage-plugin-kubernetes-react';

type SecretStorePickerFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  clusterNamespace?: string;
  installationNameValue?: string;
  secretStoreValue?: string;
  isClusterSecretStore: boolean;
  onSelect: (selectedSecretStore: SecretStore | ClusterSecretStore) => void;
};

const SecretStorePickerField = ({
  id,
  label,
  helperText,
  required,
  error,
  clusterNamespace,
  installationNameValue,
  secretStoreValue,
  isClusterSecretStore,
  onSelect,
}: SecretStorePickerFieldProps) => {
  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        {isClusterSecretStore ? (
          <ClusterSecretStoreSelector
            id={id}
            label={label}
            helperText={helperText}
            required={required}
            error={error}
            installations={installationNameValue ? [installationNameValue] : []}
            selectedSecretStore={secretStoreValue}
            onChange={onSelect}
          />
        ) : (
          <SecretStoreSelector
            id={id}
            label={label}
            helperText={helperText}
            required={required}
            error={error}
            namespace={clusterNamespace}
            installations={installationNameValue ? [installationNameValue] : []}
            selectedSecretStore={secretStoreValue}
            onChange={onSelect}
          />
        )}
      </Grid>
    </Grid>
  );
};

export const SecretStorePicker = ({
  onChange,
  rawErrors,
  required,
  formData,
  formContext,
  schema,
  idSchema,
  uiSchema,
}: SecretStorePickerProps) => {
  const {
    isClusterSecretStore = false,
    clusterNamespace: clusterNamespaceOption,
    clusterNamespaceField: clusterNamespaceFieldOption,
    installationName: installationNameOption,
    installationNameField: installationNameFieldOption,
  } = uiSchema?.['ui:options'] ?? {};

  const title =
    (schema.title ?? isClusterSecretStore)
      ? 'Cluster secret store'
      : 'Secret store';
  const description =
    (schema.description ?? isClusterSecretStore)
      ? 'Cluster secret store reference.'
      : 'Secret store reference.';

  const installationName = useValueFromOptions(
    formContext,
    installationNameOption,
    installationNameFieldOption,
  );

  const clusterNamespace = useValueFromOptions(
    formContext,
    clusterNamespaceOption,
    clusterNamespaceFieldOption,
  );

  const handleSecretStoreSelect = (
    selectedSecretStore: SecretStore | ClusterSecretStore,
  ) => {
    onChange(selectedSecretStore.getName());
  };

  return (
    <SecretStorePickerField
      id={idSchema?.$id}
      label={title}
      helperText={description}
      required={required}
      error={rawErrors?.length > 0 && !formData}
      clusterNamespace={clusterNamespace}
      installationNameValue={installationName}
      secretStoreValue={formData}
      onSelect={handleSecretStoreSelect}
      isClusterSecretStore={isClusterSecretStore}
    />
  );
};
