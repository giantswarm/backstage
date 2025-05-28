import { useCallback } from 'react';
import { Grid } from '@material-ui/core';
import { OrganizationPickerProps } from './schema';
import { useOrganizations } from '../../hooks/useOrganizations';
import { SelectFormField } from '../../UI/SelectFormField';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import { useResourcePicker } from '../hooks/useResourcePicker';
import {
  getOrganizationName,
  Organization,
} from '@giantswarm/backstage-plugin-gs-common';
import { useShowErrors } from '../../Errors/useErrors';

type OrganizationPickerFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  organizationValue?: string;
  installationName: string;
  onOrganizationSelect: (
    selectedOrganization: Organization | undefined,
  ) => void;
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
  const { resources, isLoading, errors } = useOrganizations([installationName]);

  useShowErrors(errors, {
    message: 'Failed to load organizations',
  });

  const { resourceNames, selectedName, handleChange } = useResourcePicker({
    resources,
    isLoading,
    getResourceName: getOrganizationName,
    initialValue: organizationValue,
    onSelect: onOrganizationSelect,
  });

  const disabled = isLoading || !Boolean(installationName) || errors.length > 0;

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <SelectFormField
          id={id}
          label={label}
          helperText={isLoading ? 'Loading organizations...' : helperText}
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

  const installationName = useValueFromOptions(
    formContext,
    installationNameOption,
    installationNameFieldOption,
  );

  const handleOrganizationSelect = useCallback(
    (selectedOrganization: Organization | undefined) => {
      if (!selectedOrganization) {
        onChange(undefined);
        return;
      }

      onChange(getOrganizationName(selectedOrganization));
    },
    [onChange],
  );

  return (
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
  );
};
