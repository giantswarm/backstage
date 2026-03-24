import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import {
  apiDocsConfigRef,
  defaultDefinitionWidgets,
} from '@backstage/plugin-api-docs';
import { ApiEntity } from '@backstage/catalog-model';
import { crdApiWidget } from '@terasky/backstage-plugin-api-docs-module-crd';

export const ApiDocsConfigOverride = ApiBlueprint.make({
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
});
