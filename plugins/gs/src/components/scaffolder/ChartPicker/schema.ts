import { z } from 'zod/v3';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const ChartPickerFieldSchema = makeFieldSchemaFromZod(
  z.string().describe('Chart reference in format registry/repository'),
  z.object({
    entityRef: z
      .string()
      .optional()
      .describe('Direct entity reference to fetch charts for'),
    entityRefField: z
      .string()
      .optional()
      .describe(
        'The name of the field containing the entity reference to fetch charts for',
      ),
    disabledWhenField: z
      .string()
      .optional()
      .describe('Field name that, when truthy, disables this picker'),
  }),
);

export const ChartPickerSchema = ChartPickerFieldSchema.schema;

export type ChartPickerProps = typeof ChartPickerFieldSchema.type;

export type ChartPickerValue = typeof ChartPickerFieldSchema.TOutput;
