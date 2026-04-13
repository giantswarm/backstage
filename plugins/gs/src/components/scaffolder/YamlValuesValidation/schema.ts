import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

export const YamlValuesValidationFieldSchema = makeFieldSchema({
  output: z => z.boolean(),
  uiOptions: z =>
    z.object({
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
      valuesFields: z
        .array(z.string())
        .describe(
          'The list of fields with values to validate against the schema. Supports both plain YAML string fields (e.g. GSYamlValuesEditor) and ValueSourcesEditor array fields (e.g. GSValueSourcesEditor).',
        ),
      secretValuesKeys: z
        .array(z.string())
        .optional()
        .describe(
          'The list of secrets context keys containing secret values to validate against the schema',
        ),
    }),
});

export const YamlValuesValidationSchema =
  YamlValuesValidationFieldSchema.schema;

export type YamlValuesValidationProps =
  typeof YamlValuesValidationFieldSchema.type;

export type YamlValuesValidationValue =
  typeof YamlValuesValidationFieldSchema.TOutput;
