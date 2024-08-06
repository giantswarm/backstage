import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const SecretStorePickerFieldSchema = makeFieldSchemaFromZod(
  z.string(),
  z.object({
    isClusterSecretStore: z.boolean().optional().default(false),
    installationName: z.string().optional(),
    installationNameFormDataPath: z.string().optional(),
    clusterNamespace: z.string().optional(),
    clusterNamespaceFormDataPath: z.string().optional(),
  }),
);

export const SecretStorePickerSchema = SecretStorePickerFieldSchema.schema;

export type SecretStorePickerProps = typeof SecretStorePickerFieldSchema.type;
export type SecretStorePickerUIOptions =
  typeof SecretStorePickerFieldSchema.uiOptionsType;
