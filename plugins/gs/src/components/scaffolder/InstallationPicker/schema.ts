import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const InstallationPickerFieldSchema = makeFieldSchemaFromZod(
  z.object({
    installationName: z.string(),
    installationBaseDomain: z.string().optional(),
  }),
  z.object({
    autoSelectFirstValue: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        'If true, the first installation will be selected automatically',
      ),
    allowedPipelines: z
      .array(z.string())
      .optional()
      .describe(
        'If defined, only installations with the given pipelines will be shown',
      ),
    allowedProviders: z
      .array(z.string())
      .optional()
      .describe(
        'If defined, only installations with the given providers will be shown',
      ),
    allowedProvidersField: z
      .string()
      .optional()
      .describe(
        'If defined, only installations with the providers from the given field will be shown',
      ),
    widget: z
      .string()
      .optional()
      .default('radio')
      .describe(
        'The widget to use for the installation picker, e.g. "radio" or "select"',
      ),
  }),
);

export const InstallationPickerSchema = InstallationPickerFieldSchema.schema;

export type InstallationPickerProps = typeof InstallationPickerFieldSchema.type;
export type InstallationPickerValue =
  typeof InstallationPickerFieldSchema.TOutput;
