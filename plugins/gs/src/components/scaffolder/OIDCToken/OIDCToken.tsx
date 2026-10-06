import { useEffect, useMemo } from 'react';
import { get } from 'lodash';
import { oidcTokenInstallation, OIDCTokenProps } from './schema';

/**
 * Records the installation the cluster token is for. The token itself is
 * minted when the template is submitted (`GSScaffolderApiClient.scaffold`),
 * since one minted while the form is filled may have expired by then.
 */
export const OIDCToken = ({
  uiSchema,
  formContext,
  onChange,
}: OIDCTokenProps) => {
  const {
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

  return null;
};
