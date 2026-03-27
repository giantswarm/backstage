const ICON_CONTAINER_ID = 'gs-entity-header-icon-container';

function createIconElement(iconUrl: string): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.style.width = '64px';
  wrapper.style.height = '64px';
  wrapper.style.borderRadius = '6px';
  wrapper.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
  wrapper.style.marginRight = '16px';
  wrapper.style.flexShrink = '0';

  const img = document.createElement('img');
  img.src = iconUrl;
  img.alt = '';
  img.style.width = '50px';
  img.style.height = '50px';
  img.style.objectFit = 'contain';

  wrapper.appendChild(img);
  return wrapper;
}

/**
 * Injects (or updates) the entity icon into the page header via DOM
 * manipulation. The icon is placed as a flex sibling before the first
 * child of `main > header`.
 */
export function injectHeaderIcon(iconUrl: string): void {
  const header = document.querySelector('main > header');
  if (!header || !header.firstElementChild) {
    return;
  }

  let container = document.getElementById(
    ICON_CONTAINER_ID,
  ) as HTMLDivElement | null;

  if (container) {
    // Update existing icon if URL changed
    const img = container.querySelector('img');
    if (img && img.src !== iconUrl) {
      img.src = iconUrl;
    }
    return;
  }

  container = document.createElement('div');
  container.id = ICON_CONTAINER_ID;
  container.style.display = 'contents';
  container.appendChild(createIconElement(iconUrl));
  header.insertBefore(container, header.firstElementChild);
}

/** Removes the injected header icon from the DOM. */
export function removeHeaderIcon(): void {
  document.getElementById(ICON_CONTAINER_ID)?.remove();
}
