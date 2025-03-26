import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const WorkloadClusterDetailsPickerFieldSchema = makeFieldSchemaFromZod(
  z.object({
    installationName: z.string(),
  }),
  z.object({
    requestUserCredentials: z
      .object({
        secretsKey: z
          .string()
          .describe(
            'Key used within the template secrets context to store the credential',
          ),
      })
      .optional()
      .describe(
        'If defined will request user credentials to auth against the given cluster',
      ),
  }),
);

export const WorkloadClusterDetailsPickerSchema =
  WorkloadClusterDetailsPickerFieldSchema.schema;

export type WorkloadClusterDetailsPickerProps =
  typeof WorkloadClusterDetailsPickerFieldSchema.type;
