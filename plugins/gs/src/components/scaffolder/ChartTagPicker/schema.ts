import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const ChartTagPickerFieldSchema = makeFieldSchemaFromZod(
  z.string(),
  z.object({
    chartRef: z
      .string()
      .optional()
      .describe('The chart reference to fetch versions for'),
    chartRefField: z
      .string()
      .optional()
      .describe(
        'The name of the field containing the chart reference to fetch versions for',
      ),
  }),
);

export const ChartTagPickerSchema = ChartTagPickerFieldSchema.schema;

export type ChartTagPickerProps = typeof ChartTagPickerFieldSchema.type;

export type ChartTagPickerValue = typeof ChartTagPickerFieldSchema.TOutput;
