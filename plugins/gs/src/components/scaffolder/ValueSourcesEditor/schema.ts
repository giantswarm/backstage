import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

export const ValueSourcesEditorFieldSchema = makeFieldSchema({
  output: z =>
    z.array(
      z.object({
        kind: z.enum(['ConfigMap', 'Secret']),
        name: z.string(),
        valuesKey: z.string().default('values'),
        configValues: z.string().optional(),
        secretValues: z.string().optional(),
      }),
    ),
  uiOptions: z =>
    z.object({
      secretsKey: z
        .string()
        .describe('Secrets context key for aggregated secret values JSON map'),
      chartRef: z
        .string()
        .optional()
        .describe('Direct chart reference to fetch values schema for'),
      chartRefField: z
        .string()
        .optional()
        .describe('Field path containing the chart reference'),
      chartTag: z
        .string()
        .optional()
        .describe('The chart tag to fetch values schema for'),
      chartTagField: z
        .string()
        .optional()
        .describe('Field path containing the chart tag'),
    }),
});

export const ValueSourcesEditorSchema = ValueSourcesEditorFieldSchema.schema;

export type ValueSourcesEditorProps = typeof ValueSourcesEditorFieldSchema.type;

export type ValueSourcesEditorValue =
  typeof ValueSourcesEditorFieldSchema.TOutput;
