import { useRouteRef } from '@backstage/frontend-plugin-api';
import { appDeploymentTemplateRouteRef } from '../../routes';
import { useCatalogEntityByLabel } from './useCatalogEntityByLabel';

export function useEditAppDeploymentTemplate() {
  const { entity: templateEntity } = useCatalogEntityByLabel({
    kind: 'Template',
    'metadata.labels.giantswarm.io/app-deployment-action': 'edit',
  });

  const templateRoute = useRouteRef(appDeploymentTemplateRouteRef);
  const available = Boolean(templateEntity && templateRoute);

  const getTemplateUrl = (
    formData: Record<string, unknown>,
  ): string | undefined => {
    if (!templateEntity || !templateRoute) return undefined;

    const href = templateRoute({
      templateName: templateEntity.metadata.name,
      namespace: templateEntity.metadata.namespace ?? 'default',
    });

    const params = new URLSearchParams({
      formData: JSON.stringify(formData),
    });

    return `${href}?${params}`;
  };

  return { available, getTemplateUrl };
}
