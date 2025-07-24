import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';

interface CreateGetScaffolderTaskActionOptions {
  actionsRegistry: ActionsRegistryService;
}

export function createGetScaffolderTaskAction({
  actionsRegistry,
}: CreateGetScaffolderTaskActionOptions) {
  actionsRegistry.register({
    name: 'get-scaffolder-task',
    title: 'Get Scaffolder Task',
    description: 'Monitor the status and progress of template execution',
    schema: {
      input: zodSchema =>
        zodSchema.object({
          id: zodSchema
            .string()
            .describe('Task ID returned from template execution'),
        }),
      output: zodSchema =>
        zodSchema.object({
          task: zodSchema.object({
            id: zodSchema.string(),
            status: zodSchema.string(),
            createdAt: zodSchema.string(),
            completedAt: zodSchema.string().optional(),
            spec: zodSchema.record(zodSchema.unknown()),
            output: zodSchema.record(zodSchema.unknown()).optional(),
            error: zodSchema.string().optional(),
          }),
        }),
    },
    attributes: {
      readOnly: true,
      idempotent: true,
      destructive: false,
    },
    action: async ({ input, logger }) => {
      logger.info(`Retrieving scaffolder task: ${input.id}`);

      try {
        // For now, we'll simulate the scaffolder task retrieval
        // In a real implementation, you would integrate with the scaffolder backend
        // This is a placeholder that demonstrates the structure

        // Normally you would call the scaffolder API here with something like:
        // const scaffolderClient = new ScaffolderClient({ ... });
        // const task = await scaffolderClient.getTask(input.id);

        // For this implementation, we'll return a mock task response
        const mockTask = {
          id: input.id,
          status: 'completed', // Could be: 'pending', 'running', 'completed', 'failed'
          createdAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
          completedAt: new Date().toISOString(),
          spec: {
            templateRef: 'template:default/example-template',
            values: {
              name: 'example-project',
              description: 'An example project',
            },
          },
          output: {
            entityRef: 'component:default/example-project',
            repositoryUrl: 'https://github.com/example/example-project',
          },
        };

        logger.info(
          `Retrieved scaffolder task ${input.id} with status: ${mockTask.status}`,
        );

        return {
          output: {
            task: mockTask,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error('Failed to get scaffolder task', {
          error: errorMessage,
        });
        throw new Error(`Failed to get scaffolder task: ${errorMessage}`);
      }
    },
  });
}
