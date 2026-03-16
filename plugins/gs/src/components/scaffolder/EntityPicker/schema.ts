import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const EntityPickerFieldSchema = makeFieldSchemaFromZod(
  z.string().describe('Entity reference'),
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
);

export const EntityPickerSchema = EntityPickerFieldSchema.schema;

export type EntityPickerProps = typeof EntityPickerFieldSchema.type;

export type EntityPickerValue = typeof EntityPickerFieldSchema.TOutput;
