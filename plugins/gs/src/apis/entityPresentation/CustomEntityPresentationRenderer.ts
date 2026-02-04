import { defaultEntityPresentation } from '@backstage/plugin-catalog-react';
import { DefaultEntityPresentationApiRenderer } from '@backstage/plugin-catalog';
import { getIconUrlFromEntity } from '../../components/utils/entity';
import { createImageIcon } from './EntityImageIcon';

/**
 * Custom renderer that displays images from annotations
 */
export function createCustomEntityPresentationRenderer(): DefaultEntityPresentationApiRenderer {
  return {
    async: true,

    render: ({ entityRef, entity, context }) => {
      // Start with default presentation
      const presentation = defaultEntityPresentation(
        entity || entityRef,
        context,
      );

      // Check for image URL annotation
      const iconUrl = entity ? getIconUrlFromEntity(entity) : undefined;

      if (iconUrl) {
        // Replace the Icon with our custom image wrapper
        return {
          snapshot: {
            ...presentation,
            Icon: createImageIcon(iconUrl),
          },
        };
      }

      // No custom icon, return default presentation
      return {
        snapshot: presentation,
      };
    },
  };
}
