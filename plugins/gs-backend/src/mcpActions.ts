import { LoggerService } from '@backstage/backend-plugin-api';
import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import { NotFoundError } from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import fetch from 'node-fetch';
import { fetchGitHubRawContent } from './githubRawContent';
import { containerRegistryServiceRef } from './services/ContainerRegistryService';

const VALUES_SCHEMA_ANNOTATION = 'io.giantswarm.application.values-schema';
const DEPRECATED_VALUES_SCHEMA_ANNOTATION =
  'application.giantswarm.io/values-schema';

export function registerMcpActions(
  actionsRegistry: ActionsRegistryService,
  containerRegistry: typeof containerRegistryServiceRef.T,
  githubCredentialsProvider: GithubCredentialsProvider,
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
}
