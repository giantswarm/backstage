import { AuthService, DiscoveryService } from '@backstage/backend-plugin-api';
import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import qs from 'qs';

interface CreateMonitorScaffolderTaskActionOptions {
  actionsRegistry: ActionsRegistryService;
  auth: AuthService;
  discovery: DiscoveryService;
}

export function createMonitorScaffolderTaskAction({
  actionsRegistry,
  auth,
  discovery,
}: CreateMonitorScaffolderTaskActionOptions) {
  actionsRegistry.register({
    name: 'monitor-scaffolder-task',
    title: 'Monitor Scaffolder Task',
    description: 'Monitor the status and progress of template execution',
    schema: {
      input: zodSchema =>
        zodSchema.object({
          id: zodSchema
            .string()
            .describe('Task ID returned from template execution'),
          after: zodSchema.number().describe('After timestamp for events'),
        }),
      output: zodSchema =>
        zodSchema.object({
          status: zodSchema.string().describe('Status of the task'),
          message: zodSchema
            .string()
            .optional()
            .describe('Message of the task'),
          error: zodSchema.any().optional().describe('Error of the task'),
          output: zodSchema.any().optional().describe('Output of the task'),
        }),
    },
    attributes: {
      readOnly: true,
      idempotent: true,
      destructive: false,
    },
    action: async ({ input, logger, credentials }) => {
      logger.info(`Retrieving scaffolder task events: ${input.id}`);

      try {
        const { token } = await auth.getPluginRequestToken({
          onBehalfOf: credentials,
          targetPluginId: 'scaffolder',
        });

        // Make the actual POST request to the scaffolder backend
        const scaffolderBaseUrl = await discovery.getBaseUrl('scaffolder');
        const response = await fetch(
          `${scaffolderBaseUrl}/v2/tasks/${input.id}/events?${qs.stringify({ after: input.after })}`,
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

        // Determine the status and output based on the events in responseData
        let result: {
          status: string;
          output: any;
          message: string;
          error: any;
        } = {
          status: 'processing',
          output: {},
          message: '',
          error: '',
        };

        // Find the latest 'completion' event, if any
        const completionEvent = Array.isArray(responseData)
          ? responseData
              .filter((event: any) => event.type === 'completion')
              .sort(
                (a: any, b: any) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime(),
              )[0]
          : undefined;

        if (completionEvent) {
          // If a completion event exists, return completed with output (if any)
          result = {
            status: 'completed',
            output: completionEvent.body?.output,
            message: completionEvent.body?.message,
            error: completionEvent.body?.error,
          };
        }

        console.log('responseData', responseData);

        console.log('result', result);

        logger.info(`Retrieved events for scaffolder task ${input.id}`);

        return {
          output: result,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error('Failed to get scaffolder task events', {
          error: errorMessage,
        });
        throw new Error(
          `Failed to get scaffolder task events: ${errorMessage}`,
        );
      }
    },
  });
}
