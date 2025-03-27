import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const ReleasePickerFieldSchema = makeFieldSchemaFromZod(
  z.string(),
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

export const ReleasePickerSchema = ReleasePickerFieldSchema.schema;

export type ReleasePickerProps = typeof ReleasePickerFieldSchema.type;
