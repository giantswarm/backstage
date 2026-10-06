import { useCallback, useEffect, useMemo, useState } from 'react';
import useDebounce from 'react-use/esm/useDebounce';
import { useTemplateSecrets } from '@backstage/plugin-scaffolder-react';
import { oidcTokenInstallation, OIDCTokenProps } from './schema';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { useApi } from '@backstage/core-plugin-api';
import { get } from 'lodash';
import { useRegisterSecretRefresher } from '../SecretRefresh';

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
  const kubernetesAuthProvidersApi = useApi(kubernetesAuthProvidersApiRef);
  const { secrets, setSecrets } = useTemplateSecrets();
  const [credentialsCluster, setCredentialsCluster] = useState<
    string | undefined
  >(undefined);

  const mintToken = useCallback(async () => {
    if (!installationName) {
      throw new Error('No installation selected for the cluster token.');
    }
    const cluster = await kubernetesApi.getCluster(installationName);
    if (!cluster) {
      throw new Error(`Installation "${installationName}" is not configured.`);
    }
    const { authProvider, oidcTokenProvider } = cluster;
    const { token } = await kubernetesAuthProvidersApi.getCredentials(
      authProvider === 'oidc'
        ? `${authProvider}.${oidcTokenProvider}`
        : authProvider,
    );
    if (!token) {
      throw new Error(`No token for installation "${installationName}".`);
    }
    return token;
  }, [installationName, kubernetesApi, kubernetesAuthProvidersApi]);

  useRegisterSecretRefresher(
    secretsKey,
    installationName ? mintToken : undefined,
  );

  useDebounce(
    async () => {
      if (!secretsKey || !installationName) {
        return;
      }

      if (secrets[secretsKey] && credentialsCluster === installationName) {
        return;
      }

      let token: string;
      try {
        token = await mintToken();
      } catch {
        // The registered refresher mints again on submit and reports there.
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
  onChange,
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
      const installationNameFieldValue = get(
        allFormData,
        installationNameFieldOption,
      ) as string;

      return installationNameFieldValue;
    }

    return undefined;
  }, [
    installationNameOption,
    installationNameFieldOption,
    formContext.formData,
  ]);

  useEffect(() => {
    if (!installationName) {
      return;
    }

    onChange({ [oidcTokenInstallation]: installationName });
  }, [onChange, installationName]);

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
