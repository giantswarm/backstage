import { createContext, type ReactNode, useContext } from 'react';
import type { ClusterAddress } from '../../clusters/ClusterDetailsPage/useClusterFromUrl';

/**
 * The Platform section's addresses, which the app resolves through its route
 * refs: the section lives in the app, its pages in this plugin.
 */
export type PlatformLinks = {
  /** The section's own address, `/platform`. */
  platform: string;
  /** The clusters list, `/platform/clusters`. */
  clusters: string;
  /** A cluster's page, `/platform/clusters/<installation>/<namespace>/<name>`. */
  cluster: (address: ClusterAddress) => string;
};

const PlatformLinksContext = createContext<PlatformLinks | undefined>(
  undefined,
);

/** Gives the Platform section's pages their links. */
export function PlatformLinksProvider({
  links,
  children,
}: {
  links: PlatformLinks;
  children: ReactNode;
}) {
  return (
    <PlatformLinksContext.Provider value={links}>
      {children}
    </PlatformLinksContext.Provider>
  );
}

/**
 * The Platform section's links; undefined outside a `PlatformLinksProvider`,
 * where a page draws no link rather than a guessed one.
 */
export function usePlatformLinks(): PlatformLinks | undefined {
  return useContext(PlatformLinksContext);
}
