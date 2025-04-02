import React, { useCallback, useEffect, useMemo } from 'react';
import { Box, Grid, Typography } from '@material-ui/core';
import { OrganizationPickerProps } from './schema';
import { GSContext } from '../../GSContext';
import { useOrganizations } from '../../hooks/useOrganizations';
import { get } from 'lodash';
import { SelectFormField } from '../../UI/SelectFormField';
import { ErrorsProvider, useErrors } from '../../Errors';

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
  const { showError } = useErrors();
  const { resources, isLoading, errors, retry } = useOrganizations([
    installationName,
  ]);
  const loadingError = errors.length > 0 ? (errors[0] as Error) : undefined;

  useEffect(() => {
    if (!loadingError) return;

    showError(loadingError, { message: 'Failed to load releases', retry });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingError]);

  const organizations = useMemo(() => {
    if (isLoading) {
      return [];
    }

    return resources.map(organization => organization.metadata.name).sort();
  }, [isLoading, resources]);

  const [selectedOrganization, setSelectedOrganization] = React.useState<
    string | undefined
  >(organizationValue);

  useEffect(() => {
    if (
      !selectedOrganization ||
      (selectedOrganization &&
        !isLoading &&
        !organizations.includes(selectedOrganization))
    ) {
      setSelectedOrganization(undefined);
    }
  }, [isLoading, organizations, selectedOrganization]);

  useEffect(() => {
    onOrganizationSelect(selectedOrganization);
  }, [onOrganizationSelect, selectedOrganization]);

  const handleChange = (selectedItem: string) => {
    setSelectedOrganization(selectedItem);
  };

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        {isLoading ? (
          <Box mt={2}>
            <Typography variant="body1" color="textSecondary">
              Loading organizations...
            </Typography>
          </Box>
        ) : (
          <SelectFormField
            id={id}
            label={label}
            helperText={helperText}
            required={required}
            error={error}
            items={organizations}
            selectedItem={selectedOrganization ?? ''}
            onChange={handleChange}
          />
        )}
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
      <ErrorsProvider>
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
      </ErrorsProvider>
    </GSContext>
  );
};
