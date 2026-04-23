import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';

interface ManifestResult {
  assets: Record<string, boolean>;
  baseUrl: string;
}

// Module-level cache so multiple components share one manifest fetch.
let cachedPromise: Promise<ManifestResult> | null = null;
let cachedResult: ManifestResult | null = null;

/**
 * Hook that provides access to custom branding assets served by the gs-backend
 * plugin. Returns helpers to check for and resolve asset URLs, with graceful
 * fallback when no custom assets are configured.
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
      return;
    }

    if (!cachedPromise) {
      cachedPromise = (async (): Promise<ManifestResult> => {
        const baseUrl = await discoveryApi.getBaseUrl('gs');
        try {
          const response = await fetchApi.fetch(
            `${baseUrl}/branding/manifest`,
          );
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
    (filename: string) => Boolean(result?.assets[filename]),
    [result],
  );

  const getAssetUrl = useCallback(
    (filename: string) => {
      if (!result?.baseUrl || !result.assets[filename]) return undefined;
      return `${result.baseUrl}/branding/${filename}`;
    },
    [result],
  );

  return useMemo(
    () => ({ getAssetUrl, hasAsset, isLoading }),
    [getAssetUrl, hasAsset, isLoading],
  );
}
