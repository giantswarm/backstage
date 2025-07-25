import { AuthService, DiscoveryService } from '@backstage/backend-plugin-api';
import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import { parseEntityRef } from '@backstage/catalog-model';
import { CatalogService } from '@backstage/plugin-catalog-node';

interface CreateRunScaffolderTemplateActionOptions {
  discovery: DiscoveryService;
  catalog: CatalogService;
  actionsRegistry: ActionsRegistryService;
  auth: AuthService;
}

export function createRunScaffolderTemplateAction({
  auth,
  discovery,
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

        // Prepare the request payload for the scaffolder API
        const requestPayload: any = {
          templateRef: input.templateRef,
          values: input.values,
        };

        // Add optional parameters if provided
        if (input.secrets) {
          requestPayload.secrets = input.secrets;
        }

        if (input.skipValidation !== undefined) {
          requestPayload.skipValidation = input.skipValidation;
        }

        logger.info(`Executing template ${input.templateRef} with values:`, {
          templateRef: input.templateRef,
          valuesKeys: Object.keys(input.values),
          secretsKeys: input.secrets ? Object.keys(input.secrets) : [],
          skipValidation: input.skipValidation,
        });

        const { token } = await auth.getPluginRequestToken({
          onBehalfOf: credentials,
          targetPluginId: 'scaffolder',
        });

        // Make the actual POST request to the scaffolder backend
        const scaffolderBaseUrl = await discovery.getBaseUrl('scaffolder');
        const response = await fetch(`${scaffolderBaseUrl}/v2/tasks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(requestPayload),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `Scaffolder API request failed with status ${response.status}: ${errorBody}`,
          );
        }

        const responseData = await response.json();
        const taskId = responseData.id;

        if (!taskId) {
          throw new Error('No task ID returned from scaffolder API');
        }

        const taskUrl = `${scaffolderBaseUrl}/v2/tasks/${taskId}`;

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
