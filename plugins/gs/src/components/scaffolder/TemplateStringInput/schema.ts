import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const TemplateStringInputFieldSchema = makeFieldSchemaFromZod(
  z.string(),
  z.object({
    initialValue: z
      .string()
      .optional()
      .default('')
      .describe(
        'Template string for the initial value. Placeholder can be a function e.g. "admin-${{generateUID(5)}}", "created by ${{currentUser()}}", or other field name, e.g. "${{name}}", "${{description}}", etc.',
      ),
    disabledWhenField: z
      .string()
      .optional()
      .describe('Field name that, when truthy, disables this input'),
  }),
);

export const TemplateStringInputSchema = TemplateStringInputFieldSchema.schema;

export type TemplateStringInputProps =
  typeof TemplateStringInputFieldSchema.type;
