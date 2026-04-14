import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

/**
 * Schema for the YamlValuesEditor field
 */
export const YamlValuesEditorFieldSchema = makeFieldSchema({
  output: z => z.string().optional().describe('YAML string'),
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
      initialValueField: z
        .string()
        .optional()
        .describe(
          'Field path to use as initial value when the editor is empty (e.g. for edit mode)',
        ),
      height: z.number().optional().describe('Editor height in pixels'),
      maxHeight: z.number().optional().describe('Editor max height in pixels'),
    }),
});

export const YamlValuesEditorSchema = YamlValuesEditorFieldSchema.schema;

export type YamlValuesEditorProps = typeof YamlValuesEditorFieldSchema.type;

export type YamlValuesEditorValue = typeof YamlValuesEditorFieldSchema.TOutput;
