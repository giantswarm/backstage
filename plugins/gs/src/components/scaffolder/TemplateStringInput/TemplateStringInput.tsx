import { useEffect, useMemo, useState } from 'react';
import { TextField } from '@material-ui/core';
import { TemplateStringInputProps } from './schema';
import { useTemplateString } from '../../hooks/useTemplateString';
import { get } from 'lodash';

export const TemplateStringInput = (props: TemplateStringInputProps) => {
  const [initialValue, setInitialValue] = useState<string | undefined>(
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
  const disabledWhenFieldOption = uiSchema['ui:options']?.disabledWhenField;

  const allFormData = useMemo(
    () => (formContext.formData as Record<string, any>) ?? {},
    [formContext.formData],
  );
  const templatedValue = useTemplateString(initialValueTemplate, allFormData);

  const isDisabledByField = useMemo(() => {
    if (!disabledWhenFieldOption) return false;
    return Boolean(get(allFormData, disabledWhenFieldOption));
  }, [disabledWhenFieldOption, allFormData]);

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
      helperText={isDisabledByField ? undefined : description}
      required={required}
      value={formData}
      onChange={({ target: { value } }) => onChange(value)}
      error={rawErrors?.length > 0 && !formData}
      margin="dense"
      variant="outlined"
      inputProps={{ autoFocus }}
      InputLabelProps={{ shrink: true }}
      disabled={isDisabledByField}
    />
  );
};
