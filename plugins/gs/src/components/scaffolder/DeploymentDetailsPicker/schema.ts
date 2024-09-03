import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const DeploymentDetailsPickerFieldSchema = makeFieldSchemaFromZod(
  z.object({
    installationName: z.string(),
    clusterName: z.string(),
    clusterNamespace: z.string(),
    clusterOrganization: z.string(),
    wcProviderConfig: z.string(),
    mcProviderConfig: z.string(),
  }),
);

export const DeploymentDetailsPickerSchema =
  DeploymentDetailsPickerFieldSchema.schema;

export type DeploymentDetailsPickerProps =
  typeof DeploymentDetailsPickerFieldSchema.type;
