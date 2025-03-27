import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const OrganizationPickerFieldSchema = makeFieldSchemaFromZod(
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

export const OrganizationPickerSchema = OrganizationPickerFieldSchema.schema;

export type OrganizationPickerProps = typeof OrganizationPickerFieldSchema.type;
