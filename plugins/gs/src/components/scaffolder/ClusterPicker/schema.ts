import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const ClusterPickerFieldSchema = makeFieldSchemaFromZod(
  z.object({
    clusterName: z.string(),
    clusterNamespace: z.string().optional(),
    clusterOrganization: z.string().optional(),
  }),
  z.object({
    installationName: z
      .string()
      .optional()
      .describe('The name of the installation to use'),
    installationNameField: z
      .string()
      .optional()
      .describe('The name of the field to use for the installation'),
  }),
);

export const ClusterPickerSchema = ClusterPickerFieldSchema.schema;

export type ClusterPickerProps = typeof ClusterPickerFieldSchema.type;

export type ClusterPickerValue = typeof ClusterPickerFieldSchema.TOutput;
