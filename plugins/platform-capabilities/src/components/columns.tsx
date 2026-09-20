import { ReactNode, useMemo } from 'react';
import { TableColumn } from '@backstage/core-components';
import { useApiHolder } from '@backstage/frontend-plugin-api';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Skeleton } from '@backstage/ui';
import {
  CapabilityState,
  InstallationListing,
  ListInstallationsFilters,
  platformCapabilitiesApiRef,
} from '../apis';
import { ErrorAlert } from './ErrorAlert';
import { platformCapabilitiesQueryClient } from './Providers';
import { infoKey, installationsKey } from './queries';
import { MARK_LEGEND, StateIcon } from './StateIcon';

export interface InstallationCapabilityColumns {
  /** One column per capability the manager knows; none until the definitions arrived. */
  columns: TableColumn<CatalogTableRow>[];
  /** What to show above the table: the connect on a missing grant, or the manager's error. */
  notice?: ReactNode;
}

const NONE: InstallationCapabilityColumns = { columns: [] };

/**
 * The columns ask for the states and the last actions alone: the record,
 * the portals and the federation facts are the Capabilities tab's, and
 * leaving them out is a third of the manager's reads of the fleet.
 */
const SUMMARY: ListInstallationsFilters = { summary: true };

/**
 * A capability column is as wide as its header needs and no wider: one
 * icon per cell. material-table shares the rest of the table between the
 * columns without a width, so the names keep their room.
 */
const COLUMN_WIDTH = '120px';

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
 * tooltip).
 *
 * The column set is the manager's definitions (`get_info`, no repository
 * read), so the table has its columns from the first paint; each cell is a
 * skeleton until the listing arrives, which reads the fleet's repositories
 * as the person and takes its time. Usable from a page outside this plugin:
 * without the `api:platform-capabilities` extension (a customer portal) there
 * are no columns, and the queries run on this plugin's own client, so the
 * host page needs no provider.
 */
export function useInstallationCapabilityColumns(): InstallationCapabilityColumns {
  const api = useApiHolder().get(platformCapabilitiesApiRef);
  const info = useQuery(
    {
      queryKey: infoKey,
      queryFn: () => api!.getInfo(),
      enabled: Boolean(api),
    },
    platformCapabilitiesQueryClient,
  );
  const query = useQuery(
    {
      queryKey: installationsKey(SUMMARY),
      queryFn: () => api!.listInstallations(SUMMARY),
      enabled: Boolean(api),
    },
    platformCapabilitiesQueryClient,
  );
  const { data: listing, isPending } = query;
  const definitions = info.data?.definitions;
  const error = (query.error ?? info.error) as Error | null;

  return useMemo(() => {
    if (!api) {
      return NONE;
    }
    const notice = error ? (
      <QueryClientProvider client={platformCapabilitiesQueryClient}>
        <ErrorAlert title="giantswarm-platform-manager" error={error} />
      </QueryClientProvider>
    ) : undefined;
    // The listing's own set once it is in; the definitions' before that.
    const capabilities =
      listing?.capabilities ?? definitions?.map(d => d.name) ?? [];
    const columns = capabilities.map(
      (capability): TableColumn<CatalogTableRow> => ({
        title: capability,
        tooltip: MARK_LEGEND,
        field: `capabilities.${capability}`,
        sorting: false,
        width: COLUMN_WIDTH,
        cellStyle: { whiteSpace: 'nowrap' },
        render: row => {
          const name = row.entity.metadata.name;
          const testId = `capability-${capability}-${name}`;
          if (isPending) {
            return (
              <Skeleton
                width={20}
                height={20}
                data-testid={`${testId}-pending`}
              />
            );
          }
          if (!listing) {
            // The manager did not answer: the notice above says why.
            return <span data-testid={testId} />;
          }
          const entry = capabilityOf(listing, name, capability);
          return entry ? (
            <StateIcon capability={entry} testId={testId} />
          ) : (
            <span data-testid={testId}>—</span>
          );
        },
      }),
    );
    return { columns, notice };
  }, [api, listing, definitions, error, isPending]);
}
