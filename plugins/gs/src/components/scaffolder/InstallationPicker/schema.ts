import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const InstallationPickerFieldSchema = makeFieldSchemaFromZod(
  z.object({
    installationName: z.string(),
    installationBaseDomain: z.string().optional(),
  }),
  z.object({
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
    requestUserCredentials: z
      .object({
        secretsKey: z
          .string()
          .describe(
            'Key used within the template secrets context to store the credential',
          ),
      })
      .optional()
      .describe(
        'If defined will request user credentials to auth against the given cluster',
      ),
  }),
);

export const InstallationPickerSchema = InstallationPickerFieldSchema.schema;

export type InstallationPickerProps = typeof InstallationPickerFieldSchema.type;
export type InstallationPickerValue =
  typeof InstallationPickerFieldSchema.TOutput;
