import React, { useCallback, useEffect, useMemo } from 'react';
import { Grid } from '@material-ui/core';
import { OrganizationPickerProps } from './schema';
import { RadioFormField } from '../../UI/RadioFormField';
import { GSContext } from '../../GSContext';
import { useOrganizations } from '../../hooks/useOrganizations';
import { get } from 'lodash';

type OrganizationPickerFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  organizationValue?: string;
  installationName: string;
  onOrganizationSelect: (selectedOrganization: string | undefined) => void;
};

const OrganizationPickerField = ({
  id,
  label,
  helperText,
  required,
  error,
  organizationValue,
  installationName,
  onOrganizationSelect,
}: OrganizationPickerFieldProps) => {
  const {
    resources: organizationResources,
    isLoading: isLoadingOrganizations,
  } = useOrganizations([installationName]);

  const organizations = useMemo(() => {
    if (isLoadingOrganizations) {
      return [];
    }

    return organizationResources
      .map(organization => organization.metadata.name)
      .sort();
  }, [isLoadingOrganizations, organizationResources]);

  const [selectedOrganization, setSelectedOrganization] = React.useState<
    string | undefined
  >(organizationValue ?? organizations[0]);

  useEffect(() => {
    if (
      !selectedOrganization ||
      (selectedOrganization && !organizations.includes(selectedOrganization))
    ) {
      setSelectedOrganization(organizations[0]);
    }
  }, [organizations, selectedOrganization]);

  useEffect(() => {
    onOrganizationSelect(selectedOrganization);
  }, [onOrganizationSelect, selectedOrganization]);

  const handleChange = (selectedItem: string) => {
    setSelectedOrganization(selectedItem);
  };

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <RadioFormField
          id={id}
          label={label}
          helperText={helperText}
          required={required}
          error={error}
          items={organizations}
          selectedItem={selectedOrganization ?? ''}
          onChange={handleChange}
        />
      </Grid>
    </Grid>
  );
};

export const OrganizationPicker = ({
  onChange,
  rawErrors,
  required,
  formData,
  schema: { title = 'Organization', description = 'The organization' },
  uiSchema,
  idSchema,
  formContext,
}: OrganizationPickerProps) => {
  const organizationValue = formData;
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

    return '';
  }, [
    installationNameOption,
    installationNameFieldOption,
    formContext.formData,
  ]);

  const handleOrganizationSelect = useCallback(
    (selectedOrganization: string | undefined) => {
      onChange(selectedOrganization);
    },
    [onChange],
  );

  return (
    <GSContext>
      <OrganizationPickerField
        id={idSchema?.$id}
        label={title}
        helperText={description}
        required={required}
        error={rawErrors?.length > 0 && !formData}
        organizationValue={organizationValue}
        installationName={installationName ?? ''}
        onOrganizationSelect={handleOrganizationSelect}
      />
    </GSContext>
  );
};
