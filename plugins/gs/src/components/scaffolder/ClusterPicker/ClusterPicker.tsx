import { useCallback } from 'react';
import { Grid, TextField } from '@material-ui/core';
import Autocomplete from '@material-ui/lab/Autocomplete';
import { ClusterPickerProps } from './schema';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import { useResourcePicker } from '../hooks/useResourcePicker';
import {
  Cluster,
  useResources,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  getClusterOrganization,
  isManagementCluster,
} from '../../clusters/utils';

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
  const { resources, isLoading, errors } = useResources(installations, Cluster);

  useShowErrors(errors, {
    message: 'Failed to load clusters',
  });

  const { resourceNames, selectedName, handleChange } = useResourcePicker({
    resources,
    isLoading,
    initialValue: clusterNameValue,
    onSelect: onClusterSelect,
  });

  const disabled = isLoading || !Boolean(installationName) || errors.length > 0;

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <Autocomplete
          id={id}
          value={selectedName ?? null}
          onChange={(_: any, newValue: string | null) => {
            handleChange(newValue ?? '');
          }}
          options={resourceNames}
          loading={isLoading}
          disabled={disabled}
          renderInput={params => (
            <TextField
              {...params}
              label={label}
              helperText={isLoading ? 'Loading clusters...' : helperText}
              required={required}
              error={error}
              disabled={disabled}
              margin="dense"
              variant="outlined"
              InputProps={params.InputProps}
              InputLabelProps={params.InputLabelProps}
            />
          )}
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
    disabledWhenField: disabledWhenFieldOption,
  } = uiSchema?.['ui:options'] ?? {};

  const installationName = useValueFromOptions(
    formContext,
    installationNameOption,
    installationNameFieldOption,
  );

  const isDisabledByField = useValueFromOptions<boolean>(
    formContext,
    undefined,
    disabledWhenFieldOption,
  );

  const handleClusterSelect = useCallback(
    (selectedCluster: Cluster | undefined) => {
      if (!selectedCluster) {
        onChange(undefined);
        return;
      }

      onChange({
        clusterName: selectedCluster.getName(),
        clusterNamespace: selectedCluster.getNamespace(),
        clusterOrganization: getClusterOrganization(selectedCluster),
        isManagementCluster: isManagementCluster(selectedCluster),
      });
    },
    [onChange],
  );

  if (isDisabledByField) {
    return (
      <TextField
        id={idSchema?.$id}
        label={title}
        required={required}
        value={clusterName ?? ''}
        disabled
        margin="dense"
        variant="outlined"
        InputLabelProps={{ shrink: true }}
      />
    );
  }

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
