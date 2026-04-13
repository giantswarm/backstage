import { ReviewStepProps } from '@backstage/plugin-scaffolder-react';
import { ReviewState } from '@backstage/plugin-scaffolder-react/alpha';
import { JsonObject } from '@backstage/types';
import { compileSchema, draft07 } from 'json-schema-library';
import { Button, makeStyles } from '@material-ui/core';
import { CodeBlock } from '../../UI';

const useStyles = makeStyles(theme => ({
  footer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'right',
    marginTop: theme.spacing(2),
  },
  backButton: {
    marginRight: theme.spacing(1),
  },
  codeContainer: {
    maxHeight: 200,
    maxWidth: 600,
    width: '100%',
    overflow: 'auto',
    backgroundColor: theme.palette.background.default,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 4,
    padding: theme.spacing(0.5, 1),
  },
}));

type StepSchema = ReviewStepProps['steps'][number];

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getFieldDefinition(
  key: string,
  formState: JsonObject,
  schemas: StepSchema[],
): Record<string, any> | undefined {
  for (const step of schemas) {
    const schema = step.mergedSchema as JsonObject;
    // Build a data object containing only the dependency keys from formState.
    // This is required for json-schema-library to correctly resolve
    // dependencies/conditionals and return the full property definition
    // (including ui:* properties).
    const data: JsonObject = {};
    if (
      (schema as Record<string, unknown>).dependencies &&
      isJsonObject((schema as Record<string, unknown>).dependencies)
    ) {
      const deps = (schema as Record<string, unknown>)
        .dependencies as JsonObject;
      for (const dep in deps) {
        if (Object.prototype.hasOwnProperty.call(formState, dep)) {
          data[dep] = formState[dep];
        }
      }
    }
    const root = compileSchema(schema, { drafts: [draft07] });
    const { node } = root.getNode(`#/${key}`, data);
    if (node) {
      return node.schema as Record<string, any>;
    }
  }
  return undefined;
}

function shouldHideField(
  key: string,
  definition: Record<string, any> | undefined,
): boolean {
  if (key.startsWith('_')) {
    return true;
  }
  if (!definition) {
    return true;
  }
  if (definition['ui:widget'] === 'hidden') {
    return true;
  }
  const uiField = definition['ui:field'];
  const customFieldsToHide = [
    'GSOIDCToken',
    'GSYamlValuesValidation',
    'GSDeploymentPicker',
    'GSMultiSourceDeploymentPicker',
  ];
  if (uiField && customFieldsToHide.includes(uiField)) {
    return true;
  }

  return false;
}

/**
 * Transforms formData into a display-friendly version:
 * - Hides internal/hidden fields
 * - Simplifies installation/cluster objects to their name
 * - Expands valueSources into labeled groups with YAML values
 */
function transformFormData(
  formData: JsonObject,
  schemas: StepSchema[],
  codeContainerClass?: string,
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(formData)) {
    const definition = getFieldDefinition(key, formData, schemas);

    if (shouldHideField(key, definition)) {
      continue;
    }

    // Simplify installation to just the name
    if (definition && definition['ui:field'] === 'GSInstallationPicker') {
      const installationName = (value as JsonObject).installationName;
      if (typeof installationName === 'string') {
        result[key] = installationName;
        continue;
      }
    }

    // Simplify cluster to just the name
    if (definition && definition['ui:field'] === 'GSClusterPicker') {
      const clusterName = (value as JsonObject).clusterName;
      if (typeof clusterName === 'string') {
        result[key] = clusterName;
        continue;
      }
    }

    if (
      definition &&
      ['GSYamlValuesEditor', 'GSSecretYamlValuesEditor'].includes(
        definition['ui:field'],
      )
    ) {
      result[key] = [
        <div className={codeContainerClass}>
          <CodeBlock
            language="yaml"
            text={value as string}
            copyEnabled={false}
            transparent
          />
        </div>,
      ];
      continue;
    }

    if (definition && definition['ui:field'] === 'GSValueSourcesEditor') {
      const sources = value as unknown as {
        kind: string;
        name: string;
        values: string;
      }[];

      if (sources.length === 0) {
        continue;
      }

      result[key] = sources.map(s => [
        `Kind: ${s.kind}`,
        `Name: ${s.name}`,
        'Values:',
        <div className={codeContainerClass}>
          <CodeBlock
            language="yaml"
            text={s.values}
            copyEnabled={false}
            transparent
          />
        </div>,
      ]);

      continue;
    }

    result[key] = value;
  }

  return result;
}

export function ReviewStep(props: ReviewStepProps) {
  const classes = useStyles();
  const { disableButtons, formData, handleBack, handleCreate, steps } = props;

  const transformedData = transformFormData(
    formData,
    steps,
    classes.codeContainer,
  );

  return (
    <>
      <ReviewState formState={transformedData} schemas={steps as any} />

      <div className={classes.footer}>
        <Button onClick={handleBack} className={classes.backButton}>
          Back
        </Button>
        <Button
          disabled={disableButtons}
          variant="contained"
          color="primary"
          onClick={handleCreate}
        >
          Create
        </Button>
      </div>
    </>
  );
}
