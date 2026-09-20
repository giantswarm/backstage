import { ReactNode, useMemo } from 'react';
import { TableColumn } from '@backstage/core-components';
import { useApiHolder } from '@backstage/frontend-plugin-api';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Skeleton } from '@backstage/ui';
import {
  CapabilityState,
  InstallationListing,
  platformCapabilitiesApiRef,
} from '../apis';
import { ErrorAlert } from './ErrorAlert';
import { platformCapabilitiesQueryClient } from './Providers';
import { installationsKey } from './queries';
import { MARK_LEGEND, StateIcon } from './StateIcon';

export interface InstallationCapabilityColumns {
  /** One column per capability the manager knows; none until the listing arrived. */
  columns: TableColumn<CatalogTableRow>[];
  /** The capabilities the manager knows, in its order: one Consistency view each. */
  capabilities: string[];
  /** What to show above the table: the connect on a missing grant, or the manager's error. */
  notice?: ReactNode;
}

const NONE: InstallationCapabilityColumns = { columns: [], capabilities: [] };

/** The capability's entry for the installation; none for one the registry does not know. */
function capabilityOf(
  listing: InstallationListing | undefined,
  installation: string,
  capability: string,
): Pick<CapabilityState, 'state' | 'lastAction'> | undefined {
  const entry = listing?.installations.find(i => i.name === installation);
  if (!entry) {
    return listing?.unreadable?.includes(installation)
      ? { state: 'unknown' }
      : undefined;
  }
  return entry.capabilities.find(c => c.name === capability);
}

/**
 * The Installations page's capability columns: one per platform capability,
 * each cell one icon for the state of that capability on the row's
 * installation as `list_installations` reports it (the state itself in the
 * tooltip). Usable from a page outside this plugin:
 * without the `api:platform-capabilities` extension (a customer portal) there
 * are no columns, and the queries run on this plugin's own client, so the
 * host page needs no provider.
 */
export function useInstallationCapabilityColumns(): InstallationCapabilityColumns {
  const api = useApiHolder().get(platformCapabilitiesApiRef);
  const query = useQuery(
    {
      queryKey: installationsKey(),
      queryFn: () => api!.listInstallations(),
      enabled: Boolean(api),
    },
    platformCapabilitiesQueryClient,
  );
  const { data: listing, isPending } = query;
  const error = query.error as Error | null;

  return useMemo(() => {
    if (!api) {
      return NONE;
    }
    const notice = error ? (
      <QueryClientProvider client={platformCapabilitiesQueryClient}>
        <ErrorAlert title="giantswarm-platform-manager" error={error} />
      </QueryClientProvider>
    ) : undefined;
    const columns = (listing?.capabilities ?? []).map(
      (capability): TableColumn<CatalogTableRow> => ({
        title: capability,
        tooltip: MARK_LEGEND,
        field: `capabilities.${capability}`,
        sorting: false,
        render: row => {
          const name = row.entity.metadata.name;
          const entry = capabilityOf(listing, name, capability);
          if (isPending) {
            return <Skeleton width={20} height={20} />;
          }
          return entry ? (
            <StateIcon
              capability={entry}
              testId={`capability-${capability}-${name}`}
            />
          ) : (
            <span data-testid={`capability-${capability}-${name}`}>—</span>
          );
        },
      }),
    );
    return { columns, capabilities: listing?.capabilities ?? [], notice };
  }, [api, listing, error, isPending]);
}
