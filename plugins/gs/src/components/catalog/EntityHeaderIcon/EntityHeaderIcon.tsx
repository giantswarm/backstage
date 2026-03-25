import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAsyncEntity } from '@backstage/plugin-catalog-react';
import { getIconUrlFromEntity } from '../../utils/entity';

const ICON_CONTAINER_ID = 'gs-entity-header-icon-container';

/**
 * Renders a custom icon in the entity page header via a DOM portal.
 * Finds the page header element and injects the icon before its first child.
 * Mount this component anywhere inside an entity page — e.g. in a content layout.
 */
export const EntityHeaderIcon = () => {
  const { entity } = useAsyncEntity();
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  const iconUrl = entity ? getIconUrlFromEntity(entity) : undefined;

  useEffect(() => {
    if (!iconUrl) {
      return undefined;
    }

    const setupContainer = () => {
      const header = document.querySelector('main > header');
      if (!header || !header.firstElementChild) {
        return;
      }

      const firstChild = header.firstElementChild;

      let container = document.getElementById(ICON_CONTAINER_ID);
      if (!container) {
        container = document.createElement('div');
        container.id = ICON_CONTAINER_ID;
        container.style.display = 'contents';
        header.insertBefore(container, firstChild);
      }
      containerRef.current = container as HTMLDivElement;
      setPortalContainer(container as HTMLDivElement);
    };

    setupContainer();
    const timeoutId = setTimeout(setupContainer, 100);

    return () => {
      clearTimeout(timeoutId);
      if (containerRef.current && containerRef.current.parentNode) {
        containerRef.current.parentNode.removeChild(containerRef.current);
        containerRef.current = null;
      }
    };
  }, [iconUrl]);

  if (!iconUrl || !portalContainer) {
    return null;
  }

  const iconElement = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 64,
        height: 64,
        borderRadius: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        marginRight: 16,
        flexShrink: 0,
      }}
    >
      <img
        src={iconUrl}
        alt=""
        style={{
          width: 50,
          height: 50,
          objectFit: 'contain',
        }}
      />
    </div>
  );

  return createPortal(iconElement, portalContainer);
};
