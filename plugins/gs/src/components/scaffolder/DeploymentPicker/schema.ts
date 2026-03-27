import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

export const DeploymentPickerFieldSchema = makeFieldSchema({
  output: z =>
    z
      .object({
        currentValues: z.string().optional(),
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

export const DeploymentPickerSchema = DeploymentPickerFieldSchema.schema;

export type DeploymentPickerProps = typeof DeploymentPickerFieldSchema.type;

export type DeploymentPickerValue = typeof DeploymentPickerFieldSchema.TOutput;
