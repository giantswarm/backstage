import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import { parseEntityRef } from '@backstage/catalog-model';
import { CatalogService } from '@backstage/plugin-catalog-node';

interface CreateRunScaffolderTemplateActionOptions {
  catalog: CatalogService;
  actionsRegistry: ActionsRegistryService;
}

export function createRunScaffolderTemplateAction({
  catalog,
  actionsRegistry,
}: CreateRunScaffolderTemplateActionOptions) {
  actionsRegistry.register({
    name: 'run-scaffolder-template',
    title: 'Run Scaffolder Template',
    description:
      'Execute a scaffolder template with the provided values and optional secrets',
    schema: {
      input: zodSchema =>
        zodSchema.object({
          templateRef: zodSchema.string().describe('Template reference'),
          values: zodSchema
            .record(zodSchema.unknown())
            .describe('Required parameter values'),
          secrets: zodSchema
            .record(zodSchema.string())
            .optional()
            .describe('Secrets needed by the template'),
          skipValidation: zodSchema
            .boolean()
            .optional()
            .describe('Skip validation step'),
        }),
      output: zodSchema =>
        zodSchema.object({
          id: zodSchema.string().describe('The created task ID'),
          taskUrl: zodSchema.string().describe('URL to monitor the task'),
        }),
    },
    attributes: {
      readOnly: false,
      idempotent: false,
      destructive: false,
    },
    action: async ({ input, logger, credentials }) => {
      logger.info(`Running scaffolder template: ${input.templateRef}`);

      try {
        // Parse the template reference
        const entityRef = parseEntityRef(input.templateRef);

        // Get the template entity from the catalog to verify it exists
        const entity = await catalog.getEntityByRef(entityRef, { credentials });

        if (!entity) {
          throw new Error(`Template not found: ${input.templateRef}`);
        }

        if (entity.kind !== 'Template') {
          throw new Error(
            `Entity is not a template: ${input.templateRef} (kind: ${entity.kind})`,
          );
        }

        // For now, we'll simulate the scaffolder task creation
        // In a real implementation, you would integrate with the scaffolder backend
        // This is a placeholder that demonstrates the structure
        const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Normally you would call the scaffolder API here with something like:
        // const scaffolderClient = new ScaffolderClient({ ... });
        // const response = await scaffolderClient.scaffold({
        //   templateRef: input.templateRef,
        //   values: input.values,
        //   secrets: input.secrets,
        // });

        // For this implementation, we'll log the action and return a mock response
        logger.info(
          `Would execute template ${input.templateRef} with values:`,
          {
            templateRef: input.templateRef,
            valuesKeys: Object.keys(input.values),
            secretsKeys: input.secrets ? Object.keys(input.secrets) : [],
            skipValidation: input.skipValidation,
          },
        );

        const taskUrl = `/scaffolder/tasks/${taskId}`;

        logger.info(
          `Scaffolder template execution initiated. Task ID: ${taskId}`,
        );

        return {
          output: {
            id: taskId,
            taskUrl,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error('Failed to run scaffolder template', {
          error: errorMessage,
        });
        throw new Error(`Failed to run scaffolder template: ${errorMessage}`);
      }
    },
  });
}
