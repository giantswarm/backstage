import { useMemo, useState } from 'react';
import {
  Cluster,
  getClusterName,
  isManagementCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import { SelectFormField } from '../../UI/SelectFormField';
import {
  useClusters,
  useInstallations,
  useInstallationsStatuses,
} from '../../hooks';
import { Grid } from '@material-ui/core';
import { InstallationsSelector } from '../../InstallationsSelector';
import { InstallationsErrors } from '../../InstallationsErrors';
import { ClusterPickerProps } from './schema';
import {
  parseClusterPickerFormData,
  serializeClusterPickerFormData,
} from './utils';

type ClusterSelectorProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  installations: string[];
  selectedCluster?: string;
  onChange: (installationName: string, cluster: Cluster) => void;
};

const ClusterSelector = ({
  id,
  label,
  helperText,
  required,
  disabled,
  error,
  installations,
  selectedCluster,
  onChange,
}: ClusterSelectorProps) => {
  const { resources, isLoading } = useClusters(installations);

  const clusterResourcesMap = useMemo(() => {
    const clusterResources = resources.filter(
      ({ installationName, ...cluster }) =>
        !isManagementCluster(cluster, installationName),
    );

    return Object.fromEntries(
      clusterResources.map(resource => {
        const { installationName, ...cluster } = resource;

        return [getClusterName(cluster), resource];
      }),
    );
  }, [resources]);
  const clusterNames = Object.keys(clusterResourcesMap);

  const isDisabled = disabled || installations.length === 0 || isLoading;

  const handleChange = (selectedItem: string) => {
    const { installationName, ...cluster } = clusterResourcesMap[selectedItem];

    onChange(installationName, cluster);
  };

  return (
    <SelectFormField
      id={id}
      label={label}
      helperText={helperText}
      required={required}
      disabled={isDisabled}
      error={error}
      items={clusterNames}
      selectedItem={selectedCluster ?? ''}
      onChange={handleChange}
    />
  );
};

type ClusterPickerFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  installationNameValue?: string;
  clusterNameValue?: string;
  onInstallationSelect: (selectedInstallation: string) => void;
  onClusterSelect: (
    selectedInstallation: string,
    selectedCluster: Cluster,
  ) => void;
};

const ClusterPickerField = ({
  id,
  label,
  helperText,
  required,
  error,
  installationNameValue,
  clusterNameValue,
  onInstallationSelect,
  onClusterSelect,
}: ClusterPickerFieldProps) => {
  const { installations, disabledInstallations } = useInstallations();
  const { installationsStatuses } = useInstallationsStatuses();

  const [selectedInstallations, setSelectedInstallations] = useState<string[]>(
    installationNameValue ? [installationNameValue] : [],
  );

  const activeInstallations = selectedInstallations.filter(
    installationName => !disabledInstallations.includes(installationName),
  );

  const installationsErrors = installationsStatuses.some(
    installationStatus => installationStatus.isError,
  );

  const handleInstallationSelect = (selectedItems: string[]) => {
    if (selectedItems.length === 1) {
      setSelectedInstallations(selectedItems);
      onInstallationSelect(selectedItems[0]);
    }
  };

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <InstallationsSelector
          installations={installations}
          selectedInstallations={selectedInstallations}
          activeInstallations={activeInstallations}
          disabledInstallations={disabledInstallations}
          installationsStatuses={installationsStatuses}
          multiple={false}
          onChange={handleInstallationSelect}
        />
      </Grid>
      {installationsErrors && (
        <Grid item>
          <InstallationsErrors installationsStatuses={installationsStatuses} />
        </Grid>
      )}
      <Grid item>
        <ClusterSelector
          id={id}
          label={label}
          helperText={helperText}
          required={required}
          disabled={installationsErrors}
          error={error}
          installations={selectedInstallations}
          selectedCluster={clusterNameValue}
          onChange={onClusterSelect}
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
  idSchema,
}: ClusterPickerProps) => {
  const { installationName, clusterName } =
    parseClusterPickerFormData(formData);

  const handleInstallationSelect = () => {
    onChange(undefined);
  };

  const handleClusterSelect = (
    selectedInstallation: string,
    selectedCluster: Cluster,
  ) => {
    onChange(
      serializeClusterPickerFormData(
        selectedInstallation,
        getClusterName(selectedCluster),
      ),
    );
  };

  return (
    <ClusterPickerField
      id={idSchema?.$id}
      label={title}
      helperText={description}
      required={required}
      error={rawErrors?.length > 0 && !formData}
      installationNameValue={installationName}
      clusterNameValue={clusterName}
      onInstallationSelect={handleInstallationSelect}
      onClusterSelect={handleClusterSelect}
    />
  );
};
