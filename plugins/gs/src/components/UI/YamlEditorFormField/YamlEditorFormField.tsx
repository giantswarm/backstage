import {
  Box,
  FormControl,
  FormHelperText,
  FormLabel,
  useTheme,
} from '@material-ui/core';
import { YamlEditor } from '@giantswarm/backstage-plugin-ui-react';
import { JSONSchema7 } from 'json-schema';

type YamlEditorFormFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  value: string;
  onChange?: (value: string) => void;
  height?: number;
  schema?: JSONSchema7;
};

export const YamlEditorFormField = ({
  label,
  required,
  disabled,
  error,
  helperText,
  value,
  onChange,
  schema,
}: YamlEditorFormFieldProps) => {
  const theme = useTheme();
  return (
    <FormControl
      fullWidth
      required={required}
      disabled={disabled}
      error={error}
    >
      {label && <FormLabel>{label}</FormLabel>}

      <Box mt={1}>
        <YamlEditor
          initialValue={value}
          schema={schema}
          onChange={onChange}
          theme={theme.palette.type}
          error={error}
        />
      </Box>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
};
