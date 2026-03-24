/**
 * NFS frontend modules that override upstream plugin API defaults
 * with Giant Swarm custom implementations.
 *
 * In Backstage 1.48+, NFS plugins are auto-discovered and provide their
 * own default API factories. These modules override those defaults where
 * we need custom behavior (e.g. GS-specific scaffolder client, kubernetes
 * client, entity presentation, etc.).
 */
import {
  createFrontendModule,
  ApiBlueprint,
} from '@backstage/frontend-plugin-api';
import {
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
  microsoftAuthApiRef,
  googleAuthApiRef,
} from '@backstage/core-plugin-api';

import {
  catalogApiRef,
  entityPresentationApiRef,
} from '@backstage/plugin-catalog-react';
import { DefaultEntityPresentationApi } from '@backstage/plugin-catalog';
import {
  apiDocsConfigRef,
  defaultDefinitionWidgets,
} from '@backstage/plugin-api-docs';
import {
  kubernetesApiRef,
  KubernetesAuthProviders,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import {
  createGSEntityPresentationRenderer,
  gsAuthProvidersApiRef,
  GSDiscoveryApiClient,
  KubernetesClient,
} from '@giantswarm/backstage-plugin-gs';
import { ApiEntity } from '@backstage/catalog-model';
import { crdApiWidget } from '@terasky/backstage-plugin-api-docs-module-crd';
import {
  mcpAuthProvidersApiRef,
  MCPAuthProviders,
} from '@giantswarm/backstage-plugin-ai-chat';

export const catalogApiOverrides = createFrontendModule({
  pluginId: 'catalog',
  extensions: [
    ApiBlueprint.make({
      name: 'entity-presentation',
      params: defineParams =>
        defineParams({
          api: entityPresentationApiRef,
          deps: { catalogApi: catalogApiRef },
          factory: ({ catalogApi }) =>
            DefaultEntityPresentationApi.create({
              catalogApi,
              renderer: createGSEntityPresentationRenderer(),
            }),
        }),
    }),
  ],
});

export const apiDocsApiOverrides = createFrontendModule({
  pluginId: 'api-docs',
  extensions: [
    ApiBlueprint.make({
      name: 'config',
      params: defineParams =>
        defineParams({
          api: apiDocsConfigRef,
          deps: {},
          factory: () => {
            const definitionWidgets = defaultDefinitionWidgets();
            definitionWidgets.push(crdApiWidget);
            return {
              getApiDefinitionWidget: (apiEntity: ApiEntity) => {
                return definitionWidgets.find(
                  (d: { type: string }) => d.type === apiEntity.spec.type,
                );
              },
            };
          },
        }),
    }),
  ],
});

export const kubernetesApiOverrides = createFrontendModule({
  pluginId: 'kubernetes',
  extensions: [
    ApiBlueprint.make({
      name: 'auth-providers',
      params: defineParams =>
        defineParams({
          api: kubernetesAuthProvidersApiRef,
          deps: {
            microsoftAuthApi: microsoftAuthApiRef,
            googleAuthApi: googleAuthApiRef,
            gsAuthProvidersApi: gsAuthProvidersApiRef,
          },
          factory: ({
            microsoftAuthApi,
            googleAuthApi,
            gsAuthProvidersApi,
          }) => {
            const oidcProviders = {
              ...gsAuthProvidersApi.getKubernetesAuthApis(),
            };
            return new KubernetesAuthProviders({
              microsoftAuthApi,
              googleAuthApi,
              oidcProviders,
            });
          },
        }),
    }),
    ApiBlueprint.make({
      params: defineParams =>
        defineParams({
          api: kubernetesApiRef,
          deps: {
            configApi: configApiRef,
            discoveryApi: discoveryApiRef,
            fetchApi: fetchApiRef,
            kubernetesAuthProvidersApi: kubernetesAuthProvidersApiRef,
          },
          factory: ({
            configApi,
            discoveryApi,
            fetchApi,
            kubernetesAuthProvidersApi,
          }) =>
            new KubernetesClient({
              configApi,
              discoveryApi: discoveryApi as GSDiscoveryApiClient,
              fetchApi,
              kubernetesAuthProvidersApi,
            }),
        }),
    }),
  ],
});

export const aiChatApiOverrides = createFrontendModule({
  pluginId: 'ai-chat',
  extensions: [
    ApiBlueprint.make({
      name: 'mcp-auth-providers',
      params: defineParams =>
        defineParams({
          api: mcpAuthProvidersApiRef,
          deps: { gsAuthProvidersApi: gsAuthProvidersApiRef },
          factory: ({ gsAuthProvidersApi }) => {
            const authProviders = gsAuthProvidersApi.getMCPAuthApis();
            return new MCPAuthProviders(authProviders);
          },
        }),
    }),
  ],
});
