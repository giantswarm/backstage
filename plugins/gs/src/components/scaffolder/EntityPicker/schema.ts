import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

export const EntityPickerFieldSchema = makeFieldSchema({
  output: z => z.string().describe('Entity reference'),
  uiOptions: z =>
    z.object({
      allowArbitraryValues: z
        .boolean()
        .optional()
        .describe('Whether to allow arbitrary values'),
      catalogFilter: z
        .any()
        .optional()
        .describe('Catalog filter for entity search'),
      disabledWhenField: z
        .string()
        .optional()
        .describe('Field name that, when truthy, disables this picker'),
    }),
});

export const EntityPickerSchema = EntityPickerFieldSchema.schema;

export type EntityPickerProps = typeof EntityPickerFieldSchema.type;

export type EntityPickerValue = typeof EntityPickerFieldSchema.TOutput;
