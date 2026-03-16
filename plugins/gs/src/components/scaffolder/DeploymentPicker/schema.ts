import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const DeploymentPickerFieldSchema = makeFieldSchemaFromZod(
  z
    .object({
      currentValues: z.string().optional(),
      hasExistingValues: z.boolean().optional(),
      hasExistingSecrets: z.boolean().optional(),
    })
    .optional(),
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
);

export const DeploymentPickerSchema = DeploymentPickerFieldSchema.schema;

export type DeploymentPickerProps = typeof DeploymentPickerFieldSchema.type;

export type DeploymentPickerValue = typeof DeploymentPickerFieldSchema.TOutput;
