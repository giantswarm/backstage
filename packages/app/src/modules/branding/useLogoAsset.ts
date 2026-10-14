import { useBranding } from './useBranding';

/**
 * The home page logo's asset names, best first: the theme-specific file, then
 * the theme-agnostic one (see docs/branding.md).
 */
export function homeLogoCandidates(variant: 'light' | 'dark'): string[] {
  return [
    `home-logo-${variant}.svg`,
    `home-logo-${variant}.png`,
    'home-logo.svg',
    'home-logo.png',
  ];
}

/**
 * The URL of the first of `candidates` the deployment ships as a branding
 * asset, or `undefined` when it ships none of them (or the manifest is still
 * loading — check `isLoading` before falling back to a default logo).
 */
export function useLogoAsset(candidates: readonly string[]) {
  const { hasAsset, getAssetUrl, isLoading } = useBranding();
  const name = candidates.find(candidate => hasAsset(candidate));
  return {
    isLoading,
    name,
    url: name ? getAssetUrl(name) : undefined,
  };
}
