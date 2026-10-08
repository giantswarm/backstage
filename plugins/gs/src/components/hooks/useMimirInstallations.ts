import { useMemo } from 'react';
import { useInstallations } from '../../apis/installations';

/**
 * The given installations minus those without Mimir
 * (`mimirEnabled: false`), whose queries could only fail. Empty, with
 * `isLoading`, until the installations config loads.
 */
export function useMimirInstallations(installations: string[]): {
  installations: string[];
  isLoading: boolean;
} {
  const { installations: installationsConfig, isLoading } = useInstallations();

  const mimirInstallations = useMemo(() => {
    if (isLoading) {
      return [];
    }
    const withoutMimir = new Set(
      installationsConfig
        .filter(({ mimirEnabled }) => mimirEnabled === false)
        .map(({ name }) => name),
    );
    return installations.filter(name => !withoutMimir.has(name));
  }, [installations, installationsConfig, isLoading]);

  return {
    installations: mimirInstallations,
    isLoading: installations.length > 0 && isLoading,
  };
}
