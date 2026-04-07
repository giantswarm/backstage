import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

export const MultiSourceDeploymentPickerFieldSchema = makeFieldSchema({
  output: z =>
    z
      .object({
        currentValues: z.string().optional(),
        currentValueSources: z
          .array(
            z.object({
              kind: z.enum(['ConfigMap', 'Secret']),
              name: z.string(),
              valuesKey: z.string(),
              values: z.string().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  uiOptions: z =>
    z.object({
      installationNameField: z
        .string()
        .optional()
        .describe('Field path to the installation name'),
      clusterNameField: z
        .string()
        .optional()
        .describe('Field path to the cluster name'),
      clusterNamespaceField: z
        .string()
        .optional()
        .describe('Field path to the cluster namespace'),
      deploymentNameField: z
        .string()
        .optional()
        .describe('Field path to the deployment name'),
      deploymentNamespaceField: z
        .string()
        .optional()
        .describe('Field path to the deployment namespace'),
      secretValuesKey: z
        .string()
        .optional()
        .describe(
          'Secrets context key to store decoded secret values under (e.g. SECRET_VALUES)',
        ),
    }),
});

export const MultiSourceDeploymentPickerSchema =
  MultiSourceDeploymentPickerFieldSchema.schema;

export type MultiSourceDeploymentPickerProps =
  typeof MultiSourceDeploymentPickerFieldSchema.type;

export type MultiSourceDeploymentPickerValue =
  typeof MultiSourceDeploymentPickerFieldSchema.TOutput;
