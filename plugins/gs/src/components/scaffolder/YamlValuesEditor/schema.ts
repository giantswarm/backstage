import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

/**
 * Schema for the YamlValuesEditor field
 */
export const YamlValuesEditorFieldSchema = makeFieldSchemaFromZod(
  z.string().optional().describe('YAML string'),
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
  }),
);

export const YamlValuesEditorSchema = YamlValuesEditorFieldSchema.schema;

export type YamlValuesEditorProps = typeof YamlValuesEditorFieldSchema.type;

export type YamlValuesEditorValue = typeof YamlValuesEditorFieldSchema.TOutput;
