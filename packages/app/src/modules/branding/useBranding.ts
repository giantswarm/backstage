import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';

interface ManifestResult {
  assets: Record<string, number>;
  baseUrl: string;
}

// Module-level cache so multiple components share one manifest fetch.
let cachedPromise: Promise<ManifestResult> | null = null;
let cachedResult: ManifestResult | null = null;

/**
 * Hook that provides access to custom branding assets served by the branding
 * backend plugin. Returns helpers to check for and resolve asset URLs, with
 * graceful fallback when no custom assets are configured.
 */
export function useBranding() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [result, setResult] = useState<ManifestResult | null>(cachedResult);
  const [isLoading, setIsLoading] = useState(!cachedResult);

  useEffect(() => {
    if (cachedResult) {
      setResult(cachedResult);
      setIsLoading(false);
      return undefined;
    }

    if (!cachedPromise) {
      cachedPromise = (async (): Promise<ManifestResult> => {
        const baseUrl = await discoveryApi.getBaseUrl('branding');
        try {
          const response = await fetchApi.fetch(`${baseUrl}/manifest`);
          if (response.ok) {
            const data = await response.json();
            return { assets: data.assets ?? {}, baseUrl };
          }
        } catch {
          // Branding is optional -- fall back to defaults
        }
        return { assets: {}, baseUrl };
      })();
    }

    let cancelled = false;
    cachedPromise.then(res => {
      cachedResult = res;
      if (!cancelled) {
        setResult(res);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [discoveryApi, fetchApi]);

  const hasAsset = useCallback(
    (filename: string) => result?.assets[filename] !== undefined,
    [result],
  );

  const getAssetUrl = useCallback(
    (filename: string) => {
      const version = result?.assets[filename];
      if (!result?.baseUrl || version === undefined) return undefined;
      return `${result.baseUrl}/${filename}?v=${version}`;
    },
    [result],
  );

  return useMemo(
    () => ({ getAssetUrl, hasAsset, isLoading }),
    [getAssetUrl, hasAsset, isLoading],
  );
}
