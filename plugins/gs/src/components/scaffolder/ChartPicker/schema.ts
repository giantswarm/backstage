import { z } from 'zod';
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
  }),
);

export const ChartPickerSchema = ChartPickerFieldSchema.schema;

export type ChartPickerProps = typeof ChartPickerFieldSchema.type;

export type ChartPickerValue = typeof ChartPickerFieldSchema.TOutput;
