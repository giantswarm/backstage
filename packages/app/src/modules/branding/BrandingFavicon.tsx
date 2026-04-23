import { useEffect } from 'react';
import { useBranding } from './useBranding';

// Maps a branding asset filename to the <link> tag(s) in <head> it replaces.
// Only links that are already present in index.html are updated; missing
// selectors are skipped silently.
const FAVICON_ASSETS: { filename: string; selectors: string[] }[] = [
  {
    filename: 'favicon.ico',
    selectors: [
      'link[rel="icon"][href$="favicon.ico"]',
      'link[rel="shortcut icon"]',
    ],
  },
  {
    filename: 'favicon-16x16.png',
    selectors: ['link[rel="icon"][sizes="16x16"]'],
  },
  {
    filename: 'favicon-32x32.png',
    selectors: ['link[rel="icon"][sizes="32x32"]'],
  },
  {
    filename: 'apple-touch-icon.png',
    selectors: ['link[rel="apple-touch-icon"]'],
  },
  {
    filename: 'safari-pinned-tab.svg',
    selectors: ['link[rel="mask-icon"]'],
  },
];

/**
 * Updates favicon and related <link> tags in <head> at runtime when matching
 * branding assets are available. Renders nothing. When no custom favicon is
 * provided, the defaults bundled in index.html remain unchanged.
 */
export const BrandingFavicon = () => {
  const { hasAsset, getAssetUrl, isLoading } = useBranding();

  useEffect(() => {
    if (isLoading) return undefined;

    const originalHrefs = new Map<Element, string | null>();

    for (const { filename, selectors } of FAVICON_ASSETS) {
      if (!hasAsset(filename)) continue;
      const url = getAssetUrl(filename);
      if (!url) continue;

      for (const selector of selectors) {
        const elements = document.head.querySelectorAll(selector);
        elements.forEach(element => {
          originalHrefs.set(element, element.getAttribute('href'));
          element.setAttribute('href', url);
        });
      }
    }

    return () => {
      originalHrefs.forEach((href, element) => {
        if (href === null) {
          element.removeAttribute('href');
        } else {
          element.setAttribute('href', href);
        }
      });
    };
  }, [hasAsset, getAssetUrl, isLoading]);

  return null;
};
