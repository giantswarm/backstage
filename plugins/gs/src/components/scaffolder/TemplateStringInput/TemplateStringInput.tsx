import React, { useEffect } from 'react';
import { TextField } from '@material-ui/core';
import { TemplateStringInputProps } from './schema';
import { formatTemplateString } from '../../utils/formatTemplateString';

export const TemplateStringInput = (props: TemplateStringInputProps) => {
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

  useEffect(() => {
    if (formData) {
      return;
    }

    const initialValue = formatTemplateString(
      initialValueTemplate,
      (formContext.formData as Record<string, any>) ?? {},
    );

    onChange(initialValue);
  }, [formContext.formData, formData, initialValueTemplate, onChange]);

  return (
    <TextField
      id={idSchema?.$id}
      label={title}
      placeholder={placeholder}
      helperText={description}
      required={required}
      value={formData}
      onChange={({ target: { value } }) => onChange(value)}
      margin="normal"
      error={rawErrors?.length > 0 && !formData}
      inputProps={{ autoFocus }}
    />
  );
};
