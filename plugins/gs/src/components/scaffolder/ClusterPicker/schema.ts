import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

export const ClusterPickerFieldSchema = makeFieldSchema({
  output: z =>
    z.object({
      clusterName: z.string(),
      clusterNamespace: z.string().optional(),
      clusterOrganization: z.string().optional(),
      isManagementCluster: z.boolean().optional(),
    }),
  uiOptions: z =>
    z.object({
      installationName: z
        .string()
        .optional()
        .describe('The name of the installation to use'),
      installationNameField: z
        .string()
        .optional()
        .describe('The name of the field to use for the installation'),
      disabledWhenField: z
        .string()
        .optional()
        .describe('Field name that, when truthy, disables this picker'),
    }),
});

export const ClusterPickerSchema = ClusterPickerFieldSchema.schema;

export type ClusterPickerProps = typeof ClusterPickerFieldSchema.type;

export type ClusterPickerValue = typeof ClusterPickerFieldSchema.TOutput;
