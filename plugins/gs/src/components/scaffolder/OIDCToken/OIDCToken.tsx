import React, { useMemo, useState } from 'react';
import useDebounce from 'react-use/esm/useDebounce';
import { useTemplateSecrets } from '@backstage/plugin-scaffolder-react';
import { OIDCTokenProps } from './schema';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useApi } from '@backstage/core-plugin-api';
import { gsKubernetesAuthProvidersApiRef } from '../../../apis/kubernetes-auth-providers';

type OIDCTokenFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  secretsKey?: string;
  installationName?: string;
};

const OIDCTokenField = ({
  secretsKey,
  installationName,
}: OIDCTokenFieldProps) => {
  const kubernetesApi = useApi(kubernetesApiRef);
  const kubernetesAuthProvidersApi = useApi(gsKubernetesAuthProvidersApiRef);
  const { secrets, setSecrets } = useTemplateSecrets();
  const [credentialsCluster, setCredentialsCluster] = useState<
    string | undefined
  >(undefined);
  useDebounce(
    async () => {
      if (!secretsKey || !installationName) {
        return;
      }

      if (secrets[secretsKey] && credentialsCluster === installationName) {
        return;
      }

      const cluster = await kubernetesApi.getCluster(installationName);

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

      setSecrets({ [secretsKey]: token });
      setCredentialsCluster(installationName);
    },
    100,
    [secretsKey, installationName, credentialsCluster, setCredentialsCluster],
  );

  return null;
};

export const OIDCToken = ({
  rawErrors,
  required,
  formData,
  schema: { title = 'Cluster', description = 'Workload cluster name' },
  uiSchema,
  idSchema,
  formContext,
}: OIDCTokenProps) => {
  const {
    secretsKey,
    installationName: installationNameOption,
    installationNameField: installationNameFieldOption,
  } = uiSchema?.['ui:options'] ?? {};

  const installationName = useMemo(() => {
    if (installationNameOption) {
      return installationNameOption;
    }

    if (installationNameFieldOption) {
      const allFormData = (formContext.formData as Record<string, any>) ?? {};
      const installationNameFieldValue = allFormData[
        installationNameFieldOption
      ] as string;

      return installationNameFieldValue;
    }

    return undefined;
  }, [
    installationNameOption,
    installationNameFieldOption,
    formContext.formData,
  ]);

  return (
    <OIDCTokenField
      id={idSchema?.$id}
      label={title}
      helperText={description}
      required={required}
      error={rawErrors?.length > 0 && !formData}
      secretsKey={secretsKey}
      installationName={installationName}
    />
  );
};
