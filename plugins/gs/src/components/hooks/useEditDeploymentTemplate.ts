import { useRouteRef } from '@backstage/frontend-plugin-api';
import { appDeploymentTemplateRouteRef } from '../../routes';
import { useCatalogEntityByRef } from './useCatalogEntityByRef';

const TEMPLATE_NAME = 'edit-app-deployment';

export function useEditDeploymentTemplate() {
  const { entity: templateEntityGS } = useCatalogEntityByRef({
    kind: 'template',
    name: TEMPLATE_NAME,
    namespace: 'giantswarm',
  });
  const { entity: templateEntityDefault } = useCatalogEntityByRef({
    kind: 'template',
    name: TEMPLATE_NAME,
    namespace: 'default',
  });

  const templateEntity = templateEntityGS || templateEntityDefault;
  const templateRoute = useRouteRef(appDeploymentTemplateRouteRef);
  const available = Boolean(templateEntity && templateRoute);

  const getTemplateUrl = (
    formData: Record<string, unknown>,
  ): string | undefined => {
    if (!templateEntity || !templateRoute) return undefined;

    const href = templateRoute({
      templateName: TEMPLATE_NAME,
      namespace: templateEntity.metadata.namespace ?? 'default',
    });

    const params = new URLSearchParams({
      formData: JSON.stringify(formData),
    });

    return `${href}?${params}`;
  };

  return { available, getTemplateUrl };
}
