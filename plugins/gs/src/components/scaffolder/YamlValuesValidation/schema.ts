import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const YamlValuesValidationFieldSchema = makeFieldSchemaFromZod(
  z.boolean(),
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
        'The list of fields with values to validate against the schema',
      ),
  }),
);

export const YamlValuesValidationSchema =
  YamlValuesValidationFieldSchema.schema;

export type YamlValuesValidationProps =
  typeof YamlValuesValidationFieldSchema.type;

export type YamlValuesValidationValue =
  typeof YamlValuesValidationFieldSchema.TOutput;
