import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { CatalogService } from '@backstage/plugin-catalog-node';

interface CreateRetrieveScaffolderTemplateActionOptions {
  catalog: CatalogService;
  actionsRegistry: ActionsRegistryService;
}

export function createRetrieveScaffolderTemplateAction({
  catalog,
  actionsRegistry,
}: CreateRetrieveScaffolderTemplateActionOptions) {
  actionsRegistry.register({
    name: 'retrieve-scaffolder-template',
    title: 'Retrieve Scaffolder Template',
    description:
      'Get detailed information about a specific template, including parameters, steps, and requirements',
    schema: {
      input: zodSchema =>
        zodSchema.object({
          name: zodSchema.string().describe('Template name'),
          namespace: zodSchema
            .string()
            .optional()
            .describe('Template namespace (defaults to "default")'),
        }),
      output: zodSchema =>
        zodSchema.object({
          entityRef: zodSchema.string(),
          spec: zodSchema.string(),
        }),
    },
    attributes: {
      readOnly: true,
      idempotent: true,
      destructive: false,
    },
    action: async ({ input, logger, credentials }) => {
      const namespace = input.namespace || 'default';
      logger.info(
        `Retrieving scaffolder template: ${input.name} in namespace ${namespace}`,
      );

      try {
        // Get the specific template entity from the catalog
        const entity = await catalog.getEntityByRef(
          {
            kind: 'Template',
            namespace,
            name: input.name,
          },
          { credentials },
        );

        if (!entity) {
          throw new Error(
            `Template not found: ${input.name} in namespace ${namespace}`,
          );
        }

        // Create the entity reference
        const entityRef = stringifyEntityRef({
          kind: entity.kind,
          namespace: entity.metadata.namespace || 'default',
          name: entity.metadata.name,
        });

        // Return the template specification as a JSON string
        const spec = JSON.stringify(entity.spec || {}, null, 2);

        logger.info(`Successfully retrieved template: ${entityRef}`);

        return {
          output: {
            entityRef,
            spec,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error('Failed to retrieve scaffolder template', {
          error: errorMessage,
        });
        throw new Error(
          `Failed to retrieve scaffolder template: ${errorMessage}`,
        );
      }
    },
  });
}
