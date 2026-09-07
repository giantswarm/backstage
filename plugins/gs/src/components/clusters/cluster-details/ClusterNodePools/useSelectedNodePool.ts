import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const NAME_PARAM_KEY = 'name';
const TAB_PARAM_KEY = 'tab';

export const NODE_POOL_TABS = ['configuration', 'nodes'] as const;
export type NodePoolTab = (typeof NODE_POOL_TABS)[number];

const DEFAULT_TAB: NodePoolTab = 'configuration';

/**
 * Anything unrecognised collapses to the default tab. This is load-bearing:
 * the tab list renders no selected tab when the key matches no tab, so an
 * unexpected `?tab=` value would otherwise show an empty details section.
 */
function parseTab(value: string | null): NodePoolTab {
  return NODE_POOL_TABS.includes(value as NodePoolTab)
    ? (value as NodePoolTab)
    : DEFAULT_TAB;
}

export function useSelectedNodePool() {
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedNodePool = searchParams.get(NAME_PARAM_KEY);
  const selectedTab = parseTab(searchParams.get(TAB_PARAM_KEY));

  // Selecting another pool keeps the current tab, so stepping through pools on
  // the same tab works as a comparison.
  const setSelectedNodePool = useCallback(
    (name: string) => {
      setSearchParams(
        params => {
          params.set(NAME_PARAM_KEY, name);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setSelectedTab = useCallback(
    (tab: NodePoolTab) => {
      setSearchParams(
        params => {
          // Keep the default tab out of the URL, so `?name=<pool>` alone stays
          // the canonical link to a pool.
          if (tab === DEFAULT_TAB) {
            params.delete(TAB_PARAM_KEY);
          } else {
            params.set(TAB_PARAM_KEY, tab);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clearSelectedNodePool = useCallback(() => {
    setSearchParams(
      params => {
        params.delete(NAME_PARAM_KEY);
        params.delete(TAB_PARAM_KEY);
        return params;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return {
    selectedNodePool,
    selectedTab,
    setSelectedNodePool,
    setSelectedTab,
    clearSelectedNodePool,
  };
}
