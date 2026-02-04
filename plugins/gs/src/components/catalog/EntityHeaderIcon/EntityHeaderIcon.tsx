import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAsyncEntity } from '@backstage/plugin-catalog-react';

const ICON_ANNOTATION = 'giantswarm.io/icon-url';
const ICON_CONTAINER_ID = 'gs-entity-header-icon-container';

export const EntityHeaderIcon = () => {
  const { entity } = useAsyncEntity();
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  const iconUrl = entity?.metadata.annotations?.[ICON_ANNOTATION];

  useEffect(() => {
    if (!iconUrl) {
      return undefined;
    }

    // Find the header's left items box and insert our container BEFORE it (as a sibling)
    const setupContainer = () => {
      const leftItemsBox = document.querySelector(
        '[class*="BackstageHeader-leftItemsBox"]',
      );
      if (!leftItemsBox || !leftItemsBox.parentNode) {
        return;
      }

      // Check if container already exists
      let container = document.getElementById(ICON_CONTAINER_ID);
      if (!container) {
        container = document.createElement('div');
        container.id = ICON_CONTAINER_ID;
        // Use display:contents so this wrapper doesn't affect flex layout
        container.style.display = 'contents';
        // Insert BEFORE the leftItemsBox (as a sibling in the parent flex container)
        leftItemsBox.parentNode.insertBefore(container, leftItemsBox);
      }
      containerRef.current = container as HTMLDivElement;
      setPortalContainer(container as HTMLDivElement);
    };

    // Try immediately and also with a small delay for dynamic rendering
    setupContainer();
    const timeoutId = setTimeout(setupContainer, 100);

    return () => {
      clearTimeout(timeoutId);
      // Clean up the container when unmounting
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
