import React, { useState } from 'react';
import useDebounce from 'react-use/esm/useDebounce';
import { useTemplateSecrets } from '@backstage/plugin-scaffolder-react';
import { GSContext } from '../../GSContext';
import { Grid } from '@material-ui/core';
import { WorkloadClusterDetailsPickerProps } from './schema';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useApi } from '@backstage/core-plugin-api';
import { gsKubernetesAuthProvidersApiRef } from '../../../apis/kubernetes-auth-providers';
import { useInstallations, useInstallationsStatuses } from '../../hooks';
import { InstallationsSelector } from '../../InstallationsSelector';
import { InstallationsErrors } from '../../InstallationsErrors';

type WorkloadClusterDetailsPickerFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  requestUserCredentials?: {
    secretsKey: string;
  };
  installationNameValue?: string;
  onInstallationSelect: (selectedInstallation: string) => void;
};

type State = {
  cluster?: string;
};

const WorkloadClusterDetailsPickerField = ({
  requestUserCredentials,
  installationNameValue,
  onInstallationSelect,
}: WorkloadClusterDetailsPickerFieldProps) => {
  const { installations } = useInstallations();
  const { installationsStatuses } = useInstallationsStatuses();

  const kubernetesApi = useApi(kubernetesApiRef);
  const kubernetesAuthProvidersApi = useApi(gsKubernetesAuthProvidersApiRef);
  const { secrets, setSecrets } = useTemplateSecrets();
  const [state, setState] = useState<State>({});
  const [credentialsCluster, setCredentialsCluster] = useState<
    string | undefined
  >(undefined);

  useDebounce(
    async () => {
      if (!requestUserCredentials || !state.cluster) {
        return;
      }

      // don't show login prompt if secret value is already in state for selected host
      if (
        secrets[requestUserCredentials.secretsKey] &&
        credentialsCluster === state.cluster
      ) {
        return;
      }

      // user has requested that we use the users credentials
      // so lets grab them using the kubernetesAuthProvidersApi
      const cluster = await kubernetesApi.getCluster(state.cluster);

      if (!cluster) {
        return;
      }

      const { authProvider, oidcTokenProvider } = cluster;
      const { token } = await kubernetesAuthProvidersApi.getCredentials(
        authProvider === 'oidc'
          ? `${authProvider}.${oidcTokenProvider}`
          : authProvider,
      );

      if (!token) {
        return;
      }

      // set the secret using the key provided in the ui:options for use
      // in the templating the manifest with ${{ secrets[secretsKey] }}
      setSecrets({ [requestUserCredentials.secretsKey]: token });
      setCredentialsCluster(state.cluster);
    },
    100,
    [state],
  );

  const [selectedInstallations, setSelectedInstallations] = useState<string[]>(
    installationNameValue ? [installationNameValue] : [],
  );

  const installationsErrors = installationsStatuses.some(
    installationStatus => installationStatus.isError,
  );

  const handleInstallationSelect = (selectedItems: string[]) => {
    if (selectedItems.length === 1) {
      setSelectedInstallations(selectedItems);
      setState({ cluster: selectedItems[0] });
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
          multiple={false}
          onChange={handleInstallationSelect}
        />
      </Grid>
      {installationsErrors && (
        <Grid item>
          <InstallationsErrors installationsStatuses={installationsStatuses} />
        </Grid>
      )}
    </Grid>
  );
};

export const WorkloadClusterDetailsPicker = ({
  onChange,
  rawErrors,
  required,
  formData,
  schema: { title = 'Cluster', description = 'Workload cluster name' },
  uiSchema,
  idSchema,
}: WorkloadClusterDetailsPickerProps) => {
  const { installationName } = formData ?? {};
  const { requestUserCredentials } = uiSchema?.['ui:options'] ?? {};

  const handleInstallationSelect = (selectedInstallation: string) => {
    onChange({
      installationName: selectedInstallation,
    });
  };

  return (
    <GSContext>
      <WorkloadClusterDetailsPickerField
        id={idSchema?.$id}
        label={title}
        helperText={description}
        required={required}
        error={rawErrors?.length > 0 && !formData}
        requestUserCredentials={requestUserCredentials}
        installationNameValue={installationName}
        onInstallationSelect={handleInstallationSelect}
      />
    </GSContext>
  );
};
