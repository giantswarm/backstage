import React, { useCallback, useEffect, useMemo } from 'react';
import { Grid } from '@material-ui/core';
import { ReleasePickerProps } from './schema';
import { RadioFormField } from '../../UI/RadioFormField';
import { GSContext } from '../../GSContext';

type ReleasePickerFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  releaseValue?: string;
  installationName?: string;
  onReleaseSelect: (selectedRelease: string | undefined) => void;
};

const ReleasePickerField = ({
  id,
  label,
  helperText,
  required,
  error,
  releaseValue,
  installationName,
  onReleaseSelect,
}: ReleasePickerFieldProps) => {
  const releases: string[] = [];

  const [selectedRelease, setSelectedRelease] = React.useState<
    string | undefined
  >(releaseValue ?? releases[0]);

  useEffect(() => {
    if (selectedRelease && !releases.includes(selectedRelease)) {
      setSelectedRelease(releases[0]);
    }
  }, [releases, selectedRelease]);

  useEffect(() => {
    onReleaseSelect(selectedRelease);
  }, [onReleaseSelect, selectedRelease]);

  const handleChange = (selectedItem: string) => {
    setSelectedRelease(selectedItem);
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
          items={releases}
          selectedItem={selectedRelease ?? ''}
          onChange={handleChange}
        />
      </Grid>
    </Grid>
  );
};

export const ReleasePicker = ({
  onChange,
  rawErrors,
  required,
  formData,
  schema: { title = 'Cluster', description = 'Workload cluster name' },
  uiSchema,
  idSchema,
  formContext,
}: ReleasePickerProps) => {
  const releaseValue = formData;
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
      const installationNameFieldValue = allFormData[
        installationNameFieldOption
      ] as string;

      return installationNameFieldValue;
    }

    return '';
  }, [
    installationNameOption,
    installationNameFieldOption,
    formContext.formData,
  ]);

  const handleReleaseSelect = useCallback(
    (selectedRelease: string | undefined) => {
      onChange(selectedRelease);
    },
    [onChange],
  );

  return (
    <GSContext>
      <ReleasePickerField
        id={idSchema?.$id}
        label={title}
        helperText={description}
        required={required}
        error={rawErrors?.length > 0 && !formData}
        releaseValue={releaseValue}
        installationName={installationName}
        onReleaseSelect={handleReleaseSelect}
      />
    </GSContext>
  );
};
