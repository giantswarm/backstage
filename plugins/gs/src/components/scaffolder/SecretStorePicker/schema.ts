import { makeFieldSchema } from '@backstage/plugin-scaffolder-react';

export const SecretStorePickerFieldSchema = makeFieldSchema({
  output: z => z.string(),
  uiOptions: z =>
    z.object({
      isClusterSecretStore: z.boolean().optional().default(false),
      clusterNamespace: z
        .string()
        .optional()
        .describe('The namespace of the cluster to use'),
      clusterNamespaceField: z
        .string()
        .optional()
        .describe('The name of the field to use for the cluster namespace'),
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

export const SecretStorePickerSchema = SecretStorePickerFieldSchema.schema;

export type SecretStorePickerProps = typeof SecretStorePickerFieldSchema.type;
export type SecretStorePickerUIOptions =
  typeof SecretStorePickerFieldSchema.uiOptionsType;
