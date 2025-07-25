import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import { Entity } from '@backstage/catalog-model';
import { CatalogService } from '@backstage/plugin-catalog-node';

interface CreateFindScaffolderTemplatesActionOptions {
  catalog: CatalogService;
  actionsRegistry: ActionsRegistryService;
}

export function createFindScaffolderTemplatesAction({
  catalog,
  actionsRegistry,
}: CreateFindScaffolderTemplatesActionOptions) {
  actionsRegistry.register({
    name: 'find-scaffolder-templates',
    title: 'Find Scaffolder Templates',
    description:
      'Search for available scaffolder templates using intelligent search',
    schema: {
      input: zodSchema =>
        zodSchema.object({
          queryString: zodSchema
            .string()
            .describe('Search term for finding templates'),
        }),
      output: zodSchema =>
        zodSchema.object({
          results: zodSchema.array(
            zodSchema.object({
              type: zodSchema.string(),
              document: zodSchema.object({
                kind: zodSchema.string(),
                text: zodSchema.string(),
                type: zodSchema.string(),
                owner: zodSchema.string(),
                title: zodSchema.string(),
                keywords: zodSchema.string(),
                location: zodSchema.string(),
                lifecycle: zodSchema.string(),
                namespace: zodSchema.string(),
                componentType: zodSchema.string(),
              }),
            }),
          ),
        }),
    },
    attributes: {
      readOnly: true,
      idempotent: true,
      destructive: false,
    },
    action: async ({ input, logger, credentials }) => {
      logger.info(
        `Searching for scaffolder templates with query: ${input.queryString}`,
      );

      try {
        // Get all Template entities from the catalog
        const { items: templates } = await catalog.getEntities(
          {
            filter: {
              kind: 'Template',
            },
          },
          { credentials },
        );

        // Filter and format templates based on query string
        const queryLower = input.queryString.toLowerCase();
        const results = templates
          .filter((template: Entity) => {
            const title = template.metadata.title?.toLowerCase() || '';
            const name = template.metadata.name.toLowerCase();
            const description =
              template.metadata.description?.toLowerCase() || '';
            const tags = template.metadata.tags?.join(' ').toLowerCase() || '';

            return (
              title.includes(queryLower) ||
              name.includes(queryLower) ||
              description.includes(queryLower) ||
              tags.includes(queryLower)
            );
          })
          .map((template: Entity) => ({
            type: 'template',
            document: {
              kind: template.kind,
              text: template.metadata.description || template.metadata.name,
              type: String(template.spec?.type || 'unknown'),
              owner: String(template.spec?.owner || 'unknown'),
              title: template.metadata.title || template.metadata.name,
              keywords: template.metadata.tags?.join(', ') || '',
              location: `${template.metadata.namespace}/${template.metadata.name}`,
              lifecycle: String(template.spec?.lifecycle || 'unknown'),
              namespace: template.metadata.namespace || 'default',
              componentType: String(template.spec?.type || 'unknown'),
            },
          }));

        logger.info(`Found ${results.length} matching templates`);

        return {
          output: {
            results,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error('Failed to search scaffolder templates', {
          error: errorMessage,
        });
        throw new Error(
          `Failed to search scaffolder templates: ${errorMessage}`,
        );
      }
    },
  });
}
