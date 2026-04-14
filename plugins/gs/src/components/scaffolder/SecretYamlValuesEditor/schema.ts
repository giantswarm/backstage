import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

export const SecretYamlValuesEditorFieldSchema = makeFieldSchema({
  output: z =>
    z.string().optional().describe('YAML string (stored in secrets context)'),
  uiOptions: z =>
    z.object({
      secretsKey: z
        .string()
        .describe(
          'Key used within the template secrets context to store the secret values',
        ),
      chartRef: z
        .string()
        .optional()
        .describe('Direct chart reference to fetch values schema for'),
      chartRefField: z
        .string()
        .optional()
        .describe(
          'The name of the field containing the chart reference to fetch values schema for',
        ),
      chartTag: z
        .string()
        .optional()
        .describe('The chart tag to fetch values schema for'),
      chartTagField: z
        .string()
        .optional()
        .describe(
          'The name of the field containing the chart tag to fetch values schema for',
        ),
      height: z.number().optional().describe('Editor height in pixels'),
      maxHeight: z.number().optional().describe('Editor max height in pixels'),
    }),
});

export const SecretYamlValuesEditorSchema =
  SecretYamlValuesEditorFieldSchema.schema;

export type SecretYamlValuesEditorProps =
  typeof SecretYamlValuesEditorFieldSchema.type;

export type SecretYamlValuesEditorValue =
  typeof SecretYamlValuesEditorFieldSchema.TOutput;
