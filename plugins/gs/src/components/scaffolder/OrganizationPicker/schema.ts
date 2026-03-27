import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

export const OrganizationPickerFieldSchema = makeFieldSchema({
  output: z => z.string(),
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
    }),
});

export const OrganizationPickerSchema = OrganizationPickerFieldSchema.schema;

export type OrganizationPickerProps = typeof OrganizationPickerFieldSchema.type;
