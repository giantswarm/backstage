import { useMemo } from 'react';
import { Box, FormHelperText, FormLabel, Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import WarningIcon from '@material-ui/icons/Warning';
import * as yaml from 'js-yaml';
import { useTemplateSecrets } from '@backstage/plugin-scaffolder-react';
import type { YamlValuesValidationProps } from './schema';
import { useHelmChartValuesSchema, useHelmValuesValidation } from '../../hooks';
import { get } from 'lodash';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import classNames from 'classnames';
import { helmMerge } from '../utils/helmMerge';

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
  const secretValuesKeys = uiSchema?.['ui:options']?.secretValuesKeys;

  const { schema: jsonSchema } = useHelmChartValuesSchema(chartRef, chartTag);
  const { secrets } = useTemplateSecrets();

  const values = useMemo(() => {
    if (!valuesFields && !secretValuesKeys) {
      return {};
    }

    const allFormData = (formContext.formData as Record<string, any>) ?? {};

    // Pre-parse JSON-map secrets (used by ValueSourcesEditor for Secret items)
    const secretValuesMaps: Record<string, string> = {};
    if (secretValuesKeys) {
      for (const key of secretValuesKeys) {
        const raw = secrets[key];
        if (typeof raw === 'string' && raw) {
          try {
            const parsed = JSON.parse(raw);
            if (
              parsed &&
              typeof parsed === 'object' &&
              !Array.isArray(parsed)
            ) {
              Object.assign(secretValuesMaps, parsed);
            }
          } catch {
            // Not JSON — will be handled as plain YAML below
          }
        }
      }
    }

    let allValues = {};

    // Parse values from regular form fields
    if (valuesFields) {
      for (const field of valuesFields) {
        if (!field) continue;

        const fieldValue = get(allFormData, field);

        if (Array.isArray(fieldValue)) {
          // ValueSourcesEditor format: array of { kind, name, valuesKey, values }
          for (const item of fieldValue) {
            let yamlString: string | undefined;

            if (item.kind === 'Secret') {
              yamlString = secretValuesMaps[item.name];
            } else {
              yamlString = item.values;
            }

            if (yamlString && yamlString !== '***REDACTED***') {
              try {
                const valuesObj = yaml.load(yamlString) || {};
                allValues = helmMerge(allValues, valuesObj);
              } catch {
                // eslint-disable-next-line no-console
                console.warn('YAML parse error in value source:', item.name);
              }
            }
          }
        } else if (typeof fieldValue === 'string' && fieldValue) {
          // Plain YAML string (e.g. from GSYamlValuesEditor)
          try {
            const valuesObj = yaml.load(fieldValue) || {};
            allValues = helmMerge(allValues, valuesObj);
          } catch {
            // eslint-disable-next-line no-console
            console.warn('YAML parse error in field:', field);
          }
        }
      }
    }

    // Parse values from secrets context (plain YAML strings, e.g. from GSSecretYamlValuesEditor).
    // JSON-map secrets (from ValueSourcesEditor) are already resolved above via secretValuesMaps.
    if (secretValuesKeys) {
      for (const key of secretValuesKeys) {
        if (!key) continue;

        const secretValue = secrets[key] ?? '';
        if (!secretValue) continue;

        // Skip JSON-map secrets — already consumed by ValueSources array processing above
        try {
          const parsed = JSON.parse(secretValue);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            continue;
          }
        } catch {
          // Not JSON — handle as plain YAML below
        }

        try {
          const valuesObj = yaml.load(secretValue) || {};
          allValues = helmMerge(allValues, valuesObj);
        } catch {
          // eslint-disable-next-line no-console
          console.warn('YAML parse error in secret values key:', key);
        }
      }
    }

    return allValues;
  }, [formContext.formData, valuesFields, secretValuesKeys, secrets]);

  const { warnings: validationWarnings } = useHelmValuesValidation(
    values,
    jsonSchema,
  );

  return (
    <Box>
      {title && <FormLabel>{title}</FormLabel>}

      <YamlValuesValidationResult
        valuesFields={
          valuesFields || secretValuesKeys
            ? [...(valuesFields ?? []), ...(secretValuesKeys ?? [])]
            : undefined
        }
        validationWarnings={validationWarnings}
      />

      {description && <FormHelperText>{description}</FormHelperText>}
    </Box>
  );
};
