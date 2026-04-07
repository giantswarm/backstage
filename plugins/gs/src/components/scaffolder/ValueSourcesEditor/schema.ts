import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

export const ValueSourcesEditorFieldSchema = makeFieldSchema({
  output: z =>
    z.array(
      z.object({
        kind: z.enum(['ConfigMap', 'Secret']),
        name: z.string(),
        valuesKey: z.string().default('values'),
        values: z.string().optional(),
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
      initialNamePrefixTemplate: z
        .string()
        .optional()
        .describe(
          'Template string for name prefix (e.g. "${{chartName(chartRef)}}"). Combined with default suffixes like "-user-values", "-user-secrets".',
        ),
      initialValueSourcesField: z
        .string()
        .optional()
        .describe(
          'Field path containing initial value sources array (e.g. "_deployment.currentValueSources") for pre-populating the editor in edit mode.',
        ),
    }),
});

export const ValueSourcesEditorSchema = ValueSourcesEditorFieldSchema.schema;

export type ValueSourcesEditorProps = typeof ValueSourcesEditorFieldSchema.type;

export type ValueSourcesEditorValue =
  typeof ValueSourcesEditorFieldSchema.TOutput;
