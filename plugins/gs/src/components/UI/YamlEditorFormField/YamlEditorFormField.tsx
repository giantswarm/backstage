import { memo } from 'react';
import {
  Box,
  FormControl,
  FormLabel,
  Tooltip,
  useTheme,
} from '@material-ui/core';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
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
  maxHeight?: number;
  schema?: JSONSchema7;
};

export const YamlEditorFormField = memo(
  ({
    label,
    required,
    disabled,
    error,
    helperText,
    value,
    onChange,
    height,
    maxHeight,
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
        {label && (
          <FormLabel>
            <Box display="flex" alignItems="center" style={{ gap: 4 }}>
              {label}
              {helperText && (
                <Tooltip title={helperText} arrow>
                  <InfoOutlinedIcon fontSize="inherit" />
                </Tooltip>
              )}
            </Box>
          </FormLabel>
        )}

        <Box mt={1} data-config-docs-anchor>
          <YamlEditor
            initialValue={value}
            schema={schema}
            onChange={onChange}
            height={height !== undefined ? `${height}px` : undefined}
            maxHeight={maxHeight !== undefined ? `${maxHeight}px` : undefined}
            theme={theme.palette.type}
            error={error}
          />
        </Box>
      </FormControl>
    );
  },
);
