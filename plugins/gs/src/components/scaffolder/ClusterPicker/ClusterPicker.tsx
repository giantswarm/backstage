import { useCallback } from 'react';
import {
  Cluster,
  getClusterName,
  getClusterNamespace,
  getClusterOrganization,
} from '@giantswarm/backstage-plugin-gs-common';
import { SelectFormField } from '../../UI/SelectFormField';
import { useClusters } from '../../hooks';
import { Grid } from '@material-ui/core';
import { ClusterPickerProps } from './schema';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import { useResourcePicker } from '../hooks/useResourcePicker';
import { useShowErrors } from '../../Errors/useErrors';

type ClusterPickerFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  clusterNameValue?: string;
  installationName?: string;
  onClusterSelect: (selectedCluster: Cluster | undefined) => void;
};

const ClusterPickerField = ({
  id,
  label,
  helperText,
  required,
  error,
  clusterNameValue,
  installationName,
  onClusterSelect,
}: ClusterPickerFieldProps) => {
  const installations = installationName ? [installationName] : [];
  const { resources, isLoading, errors } = useClusters(installations);

  useShowErrors(errors, {
    message: 'Failed to load clusters',
  });

  const { resourceNames, selectedName, handleChange } = useResourcePicker({
    resources,
    isLoading,
    getResourceName: getClusterName,
    initialValue: clusterNameValue,
    onSelect: onClusterSelect,
  });

  const disabled = isLoading || !Boolean(installationName) || errors.length > 0;

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <SelectFormField
          id={id}
          label={label}
          helperText={isLoading ? 'Loading clusters...' : helperText}
          required={required}
          error={error}
          items={resourceNames}
          selectedItem={selectedName ?? ''}
          onChange={handleChange}
          disabled={disabled}
        />
      </Grid>
    </Grid>
  );
};

export const ClusterPicker = ({
  onChange,
  rawErrors,
  required,
  formData,
  schema: { title = 'Cluster', description = 'Workload cluster reference' },
  uiSchema,
  idSchema,
  formContext,
}: ClusterPickerProps) => {
  const { clusterName } = formData ?? {};
  const {
    installationName: installationNameOption,
    installationNameField: installationNameFieldOption,
  } = uiSchema?.['ui:options'] ?? {};

  const installationName = useValueFromOptions(
    formContext,
    installationNameOption,
    installationNameFieldOption,
  );

  const handleClusterSelect = useCallback(
    (selectedCluster: Cluster | undefined) => {
      if (!selectedCluster) {
        onChange(undefined);
        return;
      }

      onChange({
        clusterName: getClusterName(selectedCluster),
        clusterNamespace: getClusterNamespace(selectedCluster),
        clusterOrganization: getClusterOrganization(selectedCluster),
      });
    },
    [onChange],
  );

  return (
    <ClusterPickerField
      id={idSchema?.$id}
      label={title}
      helperText={description}
      required={required}
      error={rawErrors?.length > 0 && !formData}
      clusterNameValue={clusterName}
      installationName={installationName}
      onClusterSelect={handleClusterSelect}
    />
  );
};
