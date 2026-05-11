import { LoggerService } from '@backstage/backend-plugin-api';
import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import { parseEntityRef } from '@backstage/catalog-model';
import { NotFoundError } from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import fetch from 'node-fetch';
import { fetchGitHubRawContent } from './githubRawContent';
import { containerRegistryServiceRef } from './services/ContainerRegistryService';

const VALUES_SCHEMA_ANNOTATION = 'io.giantswarm.application.values-schema';
const DEPRECATED_VALUES_SCHEMA_ANNOTATION =
  'application.giantswarm.io/values-schema';
const PAGERDUTY_SERVICE_ID_ANNOTATION = 'pagerduty.com/service-id';
const PAGERDUTY_USER_ID_ANNOTATION = 'pagerduty.com/user-id';

export function registerMcpActions(
  actionsRegistry: ActionsRegistryService,
  containerRegistry: typeof containerRegistryServiceRef.T,
  githubCredentialsProvider: GithubCredentialsProvider,
  catalog: typeof catalogServiceRef.T,
  logger: LoggerService,
) {
  actionsRegistry.register({
    name: 'get-helm-chart-values',
    title: 'Get Helm Chart Values Schema or Default Values',
    description:
      'Fetches the values.schema.json (JSON Schema) or values.yaml (default values) for a Helm chart stored in an OCI container registry. ' +
      "Reads the chart's OCI manifest annotation to discover the URL, then fetches and returns the content. " +
      'Use this to understand what configuration options a Helm chart accepts and what its defaults are.',
    schema: {
      input: z =>
        z.object({
          registry: z
            .string()
            .describe('OCI registry host, e.g. "gsoci.azurecr.io"'),
          repository: z
            .string()
            .describe(
              'Repository path within the registry, e.g. "charts/giantswarm/important-service"',
            ),
          tag: z.string().describe('Chart version tag, e.g. "0.1.3"'),
          content: z
            .enum(['schema', 'values'])
            .default('schema')
            .describe(
              'What to fetch: "schema" for values.schema.json (JSON Schema), "values" for values.yaml (default values)',
            ),
        }),
      output: z =>
        z.object({
          url: z.string().describe('The URL the content was fetched from'),
          content: z
            .string()
            .describe(
              'The fetched content (JSON string for schema, YAML string for values)',
            ),
          contentType: z
            .enum(['schema', 'values'])
            .describe('What type of content was returned'),
        }),
    },
    attributes: { readOnly: true },
    action: async ({ input, logger: actionLogger }) => {
      const { registry, repository, tag, content } = input;

      actionLogger.info(
        `Fetching OCI manifest for ${registry}/${repository}:${tag}`,
      );
      const manifest = await containerRegistry.getTagManifest(
        registry,
        repository,
        tag,
      );

      const annotations = manifest.annotations ?? {};
      const schemaUrl =
        annotations[VALUES_SCHEMA_ANNOTATION] ??
        annotations[DEPRECATED_VALUES_SCHEMA_ANNOTATION];

      if (!schemaUrl) {
        throw new NotFoundError(
          `No values schema annotation found on ${registry}/${repository}:${tag}. ` +
            `Looked for "${VALUES_SCHEMA_ANNOTATION}" and "${DEPRECATED_VALUES_SCHEMA_ANNOTATION}".`,
        );
      }

      const targetUrl =
        content === 'values'
          ? schemaUrl.replace('values.schema.json', 'values.yaml')
          : schemaUrl;

      actionLogger.info(`Fetching ${content} from ${targetUrl}`);
      const response = targetUrl.includes('raw.githubusercontent.com')
        ? await fetchGitHubRawContent(targetUrl, githubCredentialsProvider)
        : await fetch(targetUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${content} from ${targetUrl}: HTTP ${response.status} ${response.statusText}`,
        );
      }

      const body = await response.text();

      return {
        output: {
          url: targetUrl,
          content: body,
          contentType: content,
        },
      };
    },
  });

  logger.info('Registered MCP action: get-helm-chart-values');

  actionsRegistry.register({
    name: 'get-pagerduty-ids-for-entity',
    title: 'Get PagerDuty IDs for a Catalog Entity',
    description:
      'Resolves the PagerDuty service ID and/or user ID associated with a Backstage catalog entity. ' +
      'Backstage entities are auto-annotated with PagerDuty IDs by the PagerDutyAnnotationProcessor: ' +
      `\`Group\` entities of type "team" and \`Component\` entities owned by such a team carry \`${PAGERDUTY_SERVICE_ID_ANNOTATION}\`; ` +
      `\`User\` entities matched by email carry \`${PAGERDUTY_USER_ID_ANNOTATION}\`. ` +
      'Use this to resolve a catalog entity reference (e.g. a component, team or user) to the PagerDuty IDs ' +
      'that PagerDuty MCP server tools require as input (for example, looking up the current on-call, listing incidents, ' +
      'or finding a user). Returns whichever IDs are present on the entity; throws "not found" if the entity has neither ' +
      'annotation or does not exist.',
    schema: {
      input: z =>
        z.object({
          entityRef: z
            .string()
            .describe(
              'Backstage entity reference, e.g. "component:default/my-app", "group:default/team-honeybadger", or "user:default/dmitry". Kind and namespace default to "component" / "default" if omitted.',
            ),
        }),
      output: z =>
        z.object({
          entityRef: z
            .string()
            .describe(
              'The fully-qualified entity reference that was resolved.',
            ),
          kind: z.string().describe('The kind of the resolved entity.'),
          serviceId: z
            .string()
            .optional()
            .describe(
              'PagerDuty service ID, when present. Pass this to PagerDuty MCP server tools that take a service ID.',
            ),
          userId: z
            .string()
            .optional()
            .describe(
              'PagerDuty user ID, when present. Pass this to PagerDuty MCP server tools that take a user ID.',
            ),
        }),
    },
    attributes: { readOnly: true, idempotent: true },
    action: async ({ input, credentials }) => {
      const parsed = parseEntityRef(input.entityRef, {
        defaultKind: 'component',
        defaultNamespace: 'default',
      });
      const fullRef = `${parsed.kind.toLowerCase()}:${parsed.namespace}/${parsed.name}`;

      const entity = await catalog.getEntityByRef(parsed, { credentials });
      if (!entity) {
        throw new NotFoundError(`Entity ${fullRef} not found in catalog`);
      }

      const annotations = entity.metadata.annotations ?? {};
      const serviceId = annotations[PAGERDUTY_SERVICE_ID_ANNOTATION];
      const userId = annotations[PAGERDUTY_USER_ID_ANNOTATION];

      if (!serviceId && !userId) {
        throw new NotFoundError(
          `Entity ${fullRef} has no PagerDuty annotations (${PAGERDUTY_SERVICE_ID_ANNOTATION}, ${PAGERDUTY_USER_ID_ANNOTATION})`,
        );
      }

      return {
        output: {
          entityRef: fullRef,
          kind: entity.kind,
          ...(serviceId ? { serviceId } : {}),
          ...(userId ? { userId } : {}),
        },
      };
    },
  });

  logger.info('Registered MCP action: get-pagerduty-ids-for-entity');
}
