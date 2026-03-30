import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

export const ReleasePickerFieldSchema = makeFieldSchema({
  output: z => z.string(),
  uiOptions: z =>
    z.object({
      provider: z
        .string()
        .optional()
        .describe('The name of the provider to use'),
      providerField: z
        .string()
        .optional()
        .describe('The name of the field to use for the provider'),
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

export const ReleasePickerSchema = ReleasePickerFieldSchema.schema;

export type ReleasePickerProps = typeof ReleasePickerFieldSchema.type;
