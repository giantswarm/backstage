import React, { useState } from 'react';

import { GSContext } from '../../GSContext';
import {
  Cluster,
  getClusterName,
  getClusterNamespace,
  getClusterOrganization,
  getProviderConfigName,
  ProviderConfig,
} from '@internal/plugin-gs-common';
import { useInstallations, useInstallationsStatuses } from '../../hooks';
import { Grid } from '@material-ui/core';
import { InstallationsSelector } from '../../InstallationsSelector';
import { InstallationsErrors } from '../../InstallationsErrors';
import { DeploymentDetailsPickerProps } from './schema';
import { ClusterSelector } from './ClusterSelector';
import { ProviderConfigSelector } from './ProviderConfigSelector';

type DeploymentDetailsPickerFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  displayProviderConfigsSelectors?: boolean;
  installationNameValue?: string;
  clusterNameValue?: string;
  wcProviderConfigValue?: string;
  mcProviderConfigValue?: string;
  onInstallationSelect: (selectedInstallation: string) => void;
  onClusterSelect: (selectedCluster: Cluster) => void;
  onWCProviderConfigSelect: (selectedProviderConfig: ProviderConfig) => void;
  onMCProviderConfigSelect: (selectedProviderConfig: ProviderConfig) => void;
};

const DeploymentDetailsPickerField = ({
  id,
  label,
  helperText,
  required,
  error,
  displayProviderConfigsSelectors,
  installationNameValue,
  clusterNameValue,
  wcProviderConfigValue,
  mcProviderConfigValue,
  onInstallationSelect,
  onClusterSelect,
  onWCProviderConfigSelect,
  onMCProviderConfigSelect,
}: DeploymentDetailsPickerFieldProps) => {
  const { installations } = useInstallations();
  const { installationsStatuses } = useInstallationsStatuses();

  const initiallySelectedInstallations =
    installations.length === 1 ? [installations[0]] : [];

  const [selectedInstallations, setSelectedInstallations] = useState<string[]>(
    installationNameValue
      ? [installationNameValue]
      : initiallySelectedInstallations,
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
          installationsStatuses={installationsStatuses}
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
      {displayProviderConfigsSelectors && (
        <>
          <Grid item>
            <ProviderConfigSelector
              id={`${id}-mc-provider-config`}
              label="Management cluster provider config"
              helperText="AWS access for crossplane to provision resources in the management cluster account."
              required={required}
              disabled={installationsErrors}
              error={error}
              installations={selectedInstallations}
              selectedProviderConfig={mcProviderConfigValue}
              onChange={onMCProviderConfigSelect}
            />
          </Grid>
          <Grid item>
            <ProviderConfigSelector
              id={`${id}-wc-provider-config`}
              label="Workload cluster provider config"
              helperText="AWS access for crossplane to provision resources in the workload cluster account."
              required={required}
              disabled={installationsErrors}
              error={error}
              installations={selectedInstallations}
              selectedProviderConfig={wcProviderConfigValue}
              onChange={onWCProviderConfigSelect}
            />
          </Grid>
        </>
      )}
    </Grid>
  );
};

export const DeploymentDetailsPicker = ({
  onChange,
  rawErrors,
  required,
  formData,
  schema: { title = 'Cluster', description = 'Workload cluster name' },
  uiSchema,
  idSchema,
}: DeploymentDetailsPickerProps) => {
  const { installationName, clusterName, wcProviderConfig, mcProviderConfig } =
    formData ?? {};

  const displayProviderConfigsSelectors =
    uiSchema['ui:options']?.displayProviderConfigsSelectors ?? false;

  const handleInstallationSelect = (selectedInstallation: string) => {
    onChange({
      installationName: selectedInstallation,
      clusterName: '',
      clusterNamespace: '',
      clusterOrganization: '',
      ...(displayProviderConfigsSelectors
        ? {
            wcProviderConfig: '',
            mcProviderConfig: '',
          }
        : {}),
    });
  };

  const handleClusterSelect = (selectedCluster: Cluster) => {
    if (!formData) {
      return;
    }

    onChange({
      ...formData,
      clusterName: getClusterName(selectedCluster),
      clusterNamespace: getClusterNamespace(selectedCluster) ?? '',
      clusterOrganization: getClusterOrganization(selectedCluster) ?? '',
    });
  };

  const handleWCProviderConfigSelect = (
    selectedProviderConfig: ProviderConfig,
  ) => {
    if (!formData) {
      return;
    }

    onChange({
      ...formData,
      wcProviderConfig: getProviderConfigName(selectedProviderConfig),
    });
  };

  const handleMCProviderConfigSelect = (
    selectedProviderConfig: ProviderConfig,
  ) => {
    if (!formData) {
      return;
    }

    onChange({
      ...formData,
      mcProviderConfig: getProviderConfigName(selectedProviderConfig),
    });
  };

  return (
    <GSContext>
      <DeploymentDetailsPickerField
        id={idSchema?.$id}
        label={title}
        helperText={description}
        required={required}
        error={rawErrors?.length > 0 && !formData}
        displayProviderConfigsSelectors={displayProviderConfigsSelectors}
        installationNameValue={installationName}
        clusterNameValue={clusterName}
        wcProviderConfigValue={wcProviderConfig}
        mcProviderConfigValue={mcProviderConfig}
        onInstallationSelect={handleInstallationSelect}
        onClusterSelect={handleClusterSelect}
        onWCProviderConfigSelect={handleWCProviderConfigSelect}
        onMCProviderConfigSelect={handleMCProviderConfigSelect}
      />
    </GSContext>
  );
};
