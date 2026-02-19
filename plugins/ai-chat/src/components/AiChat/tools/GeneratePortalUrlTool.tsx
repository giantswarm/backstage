import { useAssistantTool } from '@assistant-ui/react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { z } from 'zod';

import {
  catalogEntityExternalRouteRef,
  clusterDetailExternalRouteRef,
  deploymentDetailExternalRouteRef,
  fluxExternalRouteRef,
  techdocsEntityExternalRouteRef,
} from '../../../routes';

const pageTypes = [
  'cluster-detail',
  'deployment-detail',
  'catalog-entity',
  'catalog-entity-docs',
  'flux-list',
  'flux-tree',
  'clusters-list',
  'deployments-list',
  'catalog-list',
  'scaffolder',
  'installations',
] as const;

const parameters = z.object({
  pageType: z
    .enum(pageTypes)
    .describe(
      'The type of portal page to generate a URL for. Each type requires different parameters.',
    ),
  installationName: z
    .string()
    .optional()
    .describe(
      'Required for: cluster-detail, deployment-detail. The management cluster / installation name (e.g. "gazelle").',
    ),
  namespace: z
    .string()
    .optional()
    .describe(
      'Required for: cluster-detail, deployment-detail, catalog-entity, catalog-entity-docs. ' +
        'For clusters: the org namespace (e.g. "org-team-tinkerers"). ' +
        'For catalog entities: the entity namespace (usually "default").',
    ),
  name: z
    .string()
    .optional()
    .describe(
      'Required for: cluster-detail, deployment-detail, catalog-entity, catalog-entity-docs. The resource name.',
    ),
  kind: z
    .string()
    .optional()
    .describe(
      'Required for: deployment-detail - must be exactly "app" or "helmrelease" (lowercase). ' +
        'Required for: catalog-entity, catalog-entity-docs - the Backstage entity kind, lowercase ' +
        '(e.g. "component", "api", "group", "system", "domain", "resource").',
    ),
  clusters: z
    .array(z.string())
    .optional()
    .describe(
      'Optional for: flux-list, flux-tree. Array of management cluster names to filter by.',
    ),
});

type Params = z.infer<typeof parameters>;

function validateRequired(
  params: Params,
  fields: (keyof Params)[],
): string | null {
  const missing = fields.filter(f => !params[f]);
  if (missing.length > 0) {
    return `pageType '${params.pageType}' requires: ${missing.join(', ')}`;
  }
  return null;
}

/**
 * Registers the generatePortalUrl tool with the assistant runtime.
 * Uses Backstage RouteRefs to generate correct URLs.
 * Renders nothing — mount inside AssistantRuntimeProvider.
 */
export const GeneratePortalUrlTool = () => {
  const clusterDetailRoute = useRouteRef(clusterDetailExternalRouteRef);
  const deploymentDetailRoute = useRouteRef(deploymentDetailExternalRouteRef);
  const catalogEntityRoute = useRouteRef(catalogEntityExternalRouteRef);
  const techdocsEntityRoute = useRouteRef(techdocsEntityExternalRouteRef);
  const fluxRoute = useRouteRef(fluxExternalRouteRef);

  useAssistantTool({
    toolName: 'generatePortalUrl',
    description:
      'Generates a URL path for a page in the Giant Swarm developer portal. ' +
      'Use this whenever you need to link to a specific resource or page. ' +
      'Returns the URL path string (e.g. "/clusters/gazelle/org-team/mycluster").',
    parameters,
    execute: async (params: Params) => {
      switch (params.pageType) {
        case 'cluster-detail': {
          const error = validateRequired(params, [
            'installationName',
            'namespace',
            'name',
          ]);
          if (error) return { error };
          if (!clusterDetailRoute) {
            return { error: 'Cluster detail route is not configured' };
          }
          return {
            url: clusterDetailRoute({
              installationName: params.installationName!,
              namespace: params.namespace!,
              name: params.name!,
            }),
          };
        }

        case 'deployment-detail': {
          const error = validateRequired(params, [
            'installationName',
            'kind',
            'namespace',
            'name',
          ]);
          if (error) return { error };
          if (!deploymentDetailRoute) {
            return { error: 'Deployment detail route is not configured' };
          }

          const kind = params.kind!.toLowerCase();
          if (kind !== 'app' && kind !== 'helmrelease') {
            return {
              error:
                'kind must be "app" or "helmrelease" for deployment-detail',
            };
          }

          return {
            url: deploymentDetailRoute({
              installationName: params.installationName!,
              kind,
              namespace: params.namespace!,
              name: params.name!,
            }),
          };
        }

        case 'catalog-entity': {
          const error = validateRequired(params, ['namespace', 'kind', 'name']);
          if (error) return { error };
          if (!catalogEntityRoute) {
            return { error: 'Catalog entity route is not configured' };
          }
          return {
            url: catalogEntityRoute({
              namespace: params.namespace!,
              kind: params.kind!.toLowerCase(),
              name: params.name!,
            }),
          };
        }

        case 'catalog-entity-docs': {
          const error = validateRequired(params, ['namespace', 'kind', 'name']);
          if (error) return { error };
          if (!techdocsEntityRoute) {
            return { error: 'TechDocs entity route is not configured' };
          }
          return {
            url: techdocsEntityRoute({
              namespace: params.namespace!,
              kind: params.kind!.toLowerCase(),
              name: params.name!,
            }),
          };
        }

        case 'flux-list': {
          const base = fluxRoute ? fluxRoute() : '/flux';
          if (params.clusters && params.clusters.length > 0) {
            const query = params.clusters
              .map(c => `clusters=${encodeURIComponent(c)}`)
              .join('&');
            return { url: `${base}?${query}` };
          }
          return { url: base };
        }

        case 'flux-tree': {
          const base = fluxRoute ? fluxRoute() : '/flux';
          if (params.clusters && params.clusters.length > 0) {
            const query = params.clusters
              .map(c => `clusters=${encodeURIComponent(c)}`)
              .join('&');
            return { url: `${base}/tree?${query}` };
          }
          return { url: `${base}/tree` };
        }

        case 'clusters-list':
          return { url: '/clusters' };

        case 'deployments-list':
          return { url: '/deployments' };

        case 'catalog-list':
          return { url: '/catalog' };

        case 'scaffolder':
          return { url: '/create' };

        case 'installations':
          return { url: '/installations' };

        default: {
          const _exhaustive: never = params.pageType;
          return { error: `Unknown pageType: ${_exhaustive}` };
        }
      }
    },
  });

  return null;
};
