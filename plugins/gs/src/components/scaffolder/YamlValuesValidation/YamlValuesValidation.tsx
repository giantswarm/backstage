import { useEffect, useMemo, useState } from 'react';
import { Box, FormHelperText, FormLabel, Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import WarningIcon from '@material-ui/icons/Warning';
import * as yaml from 'js-yaml';
import Ajv from 'ajv/dist/2020';
import type { YamlValuesValidationProps } from './schema';
import { useSchemaForChart } from '../../hooks';
import { get } from 'lodash';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import classNames from 'classnames';

const useStyles = makeStyles(theme => ({
  container: {
    display: 'flex',
    flexDirection: 'column',
    marginTop: theme.spacing(1),
    gap: theme.spacing(2),
  },
  errorText: {
    color: theme.palette.error.main,
    marginTop: theme.spacing(1),
  },
  icon: {
    marginRight: theme.spacing(1),
    fontSize: '20px',
  },
  iconWarning: {
    color: theme.palette.warning.main,
  },
  iconSuccess: {
    color: theme.palette.success.main,
  },
  warningText: {
    color: theme.palette.warning.main,
    marginTop: theme.spacing(1),
  },
}));
/**
 * Deep merge objects using Helm-style merging logic
 */
function helmMerge(target: any, source: any): any {
  if (source === null || source === undefined) {
    return target;
  }
  if (target === null || target === undefined) {
    return source;
  }

  if (typeof source !== 'object' || Array.isArray(source)) {
    return source;
  }

  const result = { ...target };
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key]) &&
        typeof result[key] === 'object' &&
        result[key] !== null &&
        !Array.isArray(result[key])
      ) {
        result[key] = helmMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  return result;
}

type YamlValuesValidationResultProps = {
  valuesFields?: string[];
  validationWarnings: string[];
};

const YamlValuesValidationResult = ({
  valuesFields,
  validationWarnings,
}: YamlValuesValidationResultProps) => {
  const classes = useStyles();

  if (typeof valuesFields === 'undefined') {
    return <FormHelperText>No values to validate</FormHelperText>;
  }

  return (
    <Box>
      {validationWarnings.length > 0 ? (
        <Box display="flex" flexDirection="column">
          <Box display="flex" alignItems="center">
            <WarningIcon
              className={classNames(classes.icon, classes.iconWarning)}
            />
            <Typography variant="body2">
              This configuration is not valid, according to the chart's values
              schema
            </Typography>
          </Box>
          {validationWarnings.map((warning, index) => (
            <FormHelperText key={index} className={classes.warningText}>
              <code>{warning}</code>
            </FormHelperText>
          ))}
        </Box>
      ) : (
        <Box display="flex" alignItems="center">
          <CheckCircleIcon
            className={classNames(classes.icon, classes.iconSuccess)}
          />
          <Typography variant="body2">
            This configuration is valid, according to the chart's values schema
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export const YamlValuesValidation = ({
  formContext,
  schema: { title, description },
  uiSchema,
}: YamlValuesValidationProps): JSX.Element => {
  const {
    chartRef: chartRefOption,
    chartRefField: chartRefFieldOption,
    chartTag: chartTagOption,
    chartTagField: chartTagFieldOption,
  } = uiSchema?.['ui:options'] ?? {};

  const chartRef = useValueFromOptions(
    formContext,
    chartRefOption,
    chartRefFieldOption,
  );

  const chartTag = useValueFromOptions(
    formContext,
    chartTagOption,
    chartTagFieldOption,
  );

  const valuesFields = uiSchema?.['ui:options']?.valuesFields;

  const { schema: jsonSchema } = useSchemaForChart(chartRef, chartTag);

  const values = useMemo(() => {
    if (!valuesFields) {
      return {};
    }

    const allFormData = (formContext.formData as Record<string, any>) ?? {};

    let allValues = {};
    for (const field of valuesFields) {
      if (field) {
        const fieldValue = get(allFormData, field) ?? '';
        let valuesObj: any = {};

        // Parse values
        if (fieldValue) {
          try {
            valuesObj = yaml.load(fieldValue) || {};
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
          }
        }

        allValues = helmMerge(allValues, valuesObj);
      }
    }

    return allValues;
  }, [formContext.formData, valuesFields]);

  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  useEffect(() => {
    const warnings: string[] = [];

    if (!values || Object.keys(values).length === 0) {
      setValidationWarnings([]);
      return;
    }

    if (jsonSchema) {
      try {
        const ajv = new Ajv({ allErrors: true, strict: false });
        const validate = ajv.compile(jsonSchema);
        const valid = validate(values);

        if (!valid && validate.errors) {
          validate.errors.forEach(error => {
            const path = error.instancePath || '/';
            const message = error.message || 'Validation error';
            warnings.push(`${path}: ${message}`);
          });
        }
      } catch (err) {
        warnings.push(
          `Validation error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    setValidationWarnings(warnings);
  }, [values, jsonSchema]);

  return (
    <Box>
      {title && <FormLabel>{title}</FormLabel>}

      <YamlValuesValidationResult
        valuesFields={valuesFields}
        validationWarnings={validationWarnings}
      />

      {description && <FormHelperText>{description}</FormHelperText>}
    </Box>
  );
};
