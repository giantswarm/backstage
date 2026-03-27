import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

export const ChartTagPickerFieldSchema = makeFieldSchema({
  output: z => z.string(),
  uiOptions: z =>
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
});

export const ChartTagPickerSchema = ChartTagPickerFieldSchema.schema;

export type ChartTagPickerProps = typeof ChartTagPickerFieldSchema.type;

export type ChartTagPickerValue = typeof ChartTagPickerFieldSchema.TOutput;
