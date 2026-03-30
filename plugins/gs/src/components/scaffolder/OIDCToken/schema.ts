import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

export const oidcTokenInstallation = 'oidcTokenInstallation';

export const OIDCTokenFieldSchema = makeFieldSchema({
  output: z =>
    z.object({
      [oidcTokenInstallation]: z.string(),
    }),
  uiOptions: z =>
    z.object({
      secretsKey: z
        .string()
        .describe(
          'Key used within the template secrets context to store the credential',
        ),
      installationName: z
        .string()
        .optional()
        .describe('The name of the installation to use'),
      installationNameField: z
        .string()
        .optional()
        .describe('The name of the field to use for the installation'),
    }),
});

export const OIDCTokenSchema = OIDCTokenFieldSchema.schema;

export type OIDCTokenProps = typeof OIDCTokenFieldSchema.type;
