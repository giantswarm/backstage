import React, { useEffect } from 'react';
import { TextField } from '@material-ui/core';
import { TemplateStringInputProps } from './schema';
import { useTemplateString } from '../../hooks/useTemplateString';

export const TemplateStringInput = (props: TemplateStringInputProps) => {
  const [initialValue, setInitialValue] = React.useState<string | undefined>(
    undefined,
  );
  const {
    onChange,
    required,
    schema: { title = 'Name', description = 'Unique name of the component' },
    rawErrors,
    formData,
    formContext,
    uiSchema,
    idSchema,
    placeholder,
  } = props;

  const autoFocus = uiSchema['ui:autofocus'];
  const initialValueTemplate = uiSchema['ui:options']?.initialValue ?? '';

  const allFormData = (formContext.formData as Record<string, any>) ?? {};
  const templatedValue = useTemplateString(initialValueTemplate, allFormData);

  useEffect(() => {
    if (!formData && !initialValue && templatedValue) {
      setInitialValue(templatedValue);
      onChange(templatedValue);
    }
  }, [formData, initialValue, templatedValue, onChange]);

  return (
    <TextField
      id={idSchema?.$id}
      label={title}
      placeholder={placeholder}
      helperText={description}
      required={required}
      value={formData}
      onChange={({ target: { value } }) => onChange(value)}
      error={rawErrors?.length > 0 && !formData}
      inputProps={{ autoFocus }}
      InputLabelProps={{ shrink: true }}
    />
  );
};
