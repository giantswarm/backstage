import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

export const ProviderConfigPickerFieldSchema = makeFieldSchema({
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

export const ProviderConfigPickerSchema =
  ProviderConfigPickerFieldSchema.schema;

export type ProviderConfigPickerProps =
  typeof ProviderConfigPickerFieldSchema.type;

export type ProviderConfigPickerValue =
  typeof ProviderConfigPickerFieldSchema.TOutput;
