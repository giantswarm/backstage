import { useMemo } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { repositoriesApiRef } from '../apis';
import { Vocabulary, vocabularyOf } from '../lib/declaration';

/**
 * `get_info`: who the caller is and what the manager validates against. The
 * page, the team choice and the declaration form read the one query, so it
 * is asked once.
 */
export function useManagerInfo() {
  const api = useApi(repositoriesApiRef);
  return useQuery({
    queryKey: ['repositories', 'info'],
    queryFn: () => api.getInfo(),
  });
}

/**
 * The declaration's vocabulary as the manager reports it: loading while
 * `get_info` has not answered, then the vocabulary or why there is none.
 */
export type VocabularyState =
  | { status: 'loading' }
  | { status: 'ready'; vocabulary: Vocabulary }
  | { status: 'unavailable'; problem: string };

/** The declaration form's choices, from `get_info`'s `schema`; no fallback. */
export function useVocabulary(): VocabularyState {
  const info = useManagerInfo();
  return useMemo((): VocabularyState => {
    if (info.data) {
      const result = vocabularyOf(info.data);
      return 'vocabulary' in result
        ? { status: 'ready', vocabulary: result.vocabulary }
        : { status: 'unavailable', problem: result.problem };
    }
    if (info.error) {
      return {
        status: 'unavailable',
        problem: `giantswarm-repo-manager did not answer get_info, which reports the declaration's choices: ${(info.error as Error).message}`,
      };
    }
    return { status: 'loading' };
  }, [info.data, info.error]);
}
