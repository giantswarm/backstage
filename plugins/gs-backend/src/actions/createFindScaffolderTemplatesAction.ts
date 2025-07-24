import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { InputError } from '@backstage/errors';
import { CatalogService } from '@backstage/plugin-catalog-node';

export const createFindScaffolderTemplatesAction = ({
  catalog,
  actionsRegistry,
}: {
  catalog: CatalogService;
  actionsRegistry: ActionsRegistryService;
}) => {
  actionsRegistry.register({
    name: 'find-scaffolder-templates',
    title: 'Find Scaffolder Templates',
    description: `
This allows you to find scaffolder templates in the software catalog.
    `,
    schema: {
      input: z =>
        z.object({
          kind: z
            .string()
            .describe(
              'The kind of the entity to query. If the kind is unknown it can be omitted.',
            )
            .optional(),
          namespace: z
            .string()
            .describe(
              'The namespace of the entity to query. If the namespace is unknown it can be omitted.',
            )
            .optional(),
          name: z.string().describe('The name of the entity to query'),
        }),
      // TODO: is there a better way to do this?
      output: z => z.object({}).passthrough(),
    },
    action: async ({ input, credentials }) => {
      const filter: Record<string, string> = { 'metadata.name': input.name };

      if (input.kind) {
        filter.kind = input.kind;
      }

      if (input.namespace) {
        filter['metadata.namespace'] = input.namespace;
      }

      const { items } = await catalog.queryEntities(
        { filter },
        {
          credentials,
        },
      );

      if (items.length === 0) {
        throw new InputError(`No entity found with name "${input.name}"`);
      }

      if (items.length > 1) {
        throw new Error(
          `Multiple entities found with name "${
            input.name
          }", please provide more specific filters. Entities found: ${items
            .map(item => `"${stringifyEntityRef(item)}"`)
            .join(', ')}`,
        );
      }

      const [entity] = items;

      return {
        output: entity,
      };
    },
  });
};
