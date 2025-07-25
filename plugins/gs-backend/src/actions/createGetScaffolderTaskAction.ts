import { AuthService, DiscoveryService } from '@backstage/backend-plugin-api';
import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';

interface CreateGetScaffolderTaskActionOptions {
  actionsRegistry: ActionsRegistryService;
  auth: AuthService;
  discovery: DiscoveryService;
}

export function createGetScaffolderTaskAction({
  actionsRegistry,
  auth,
  discovery,
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
            lastHeartbeatAt: zodSchema.string(),
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
    action: async ({ input, logger, credentials }) => {
      logger.info(`Retrieving scaffolder task: ${input.id}`);

      try {
        const { token } = await auth.getPluginRequestToken({
          onBehalfOf: credentials,
          targetPluginId: 'scaffolder',
        });

        // Make the actual POST request to the scaffolder backend
        const scaffolderBaseUrl = await discovery.getBaseUrl('scaffolder');
        const response = await fetch(
          `${scaffolderBaseUrl}/v2/tasks/${input.id}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `Scaffolder API request failed with status ${response.status}: ${errorBody}`,
          );
        }

        const responseData = await response.json();

        const task = {
          id: responseData.id,
          status: responseData.status,
          createdAt: responseData.createdAt,
          lastHeartbeatAt: responseData.lastHeartbeatAt,
          spec: responseData.spec,
          output: responseData.spec.output,
        };

        logger.info(
          `Retrieved scaffolder task ${task.id} with status: ${task.status}`,
        );

        return {
          output: {
            task,
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
