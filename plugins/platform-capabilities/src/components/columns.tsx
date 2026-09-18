import { ReactNode, useMemo } from 'react';
import { TableColumn } from '@backstage/core-components';
import { useApiHolder } from '@backstage/frontend-plugin-api';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Skeleton } from '@backstage/ui';
import { InstallationListing, platformCapabilitiesApiRef } from '../apis';
import { ErrorAlert } from './ErrorAlert';
import { platformCapabilitiesQueryClient } from './Providers';
import { installationsKey } from './queries';
import { StateTag } from './StateTag';

export interface InstallationCapabilityColumns {
  /** One column per capability the manager knows; none until the listing arrived. */
  columns: TableColumn<CatalogTableRow>[];
  /** The capabilities the manager knows, in its order: one Consistency view each. */
  capabilities: string[];
  /** What to show above the table: the connect on a missing grant, or the manager's error. */
  notice?: ReactNode;
}

const NONE: InstallationCapabilityColumns = { columns: [], capabilities: [] };

function stateOf(
  listing: InstallationListing | undefined,
  installation: string,
  capability: string,
): string | undefined {
  const entry = listing?.installations.find(i => i.name === installation);
  if (!entry) {
    return listing?.unreadable?.includes(installation) ? 'unknown' : undefined;
  }
  return entry.capabilities.find(c => c.name === capability)?.state;
}

/**
 * The Installations page's capability columns: one per platform capability,
 * each cell the state of that capability on the row's installation as
 * `list_installations` reports it. Usable from a page outside this plugin:
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
        field: `capabilities.${capability}`,
        sorting: false,
        render: row => {
          const name = row.entity.metadata.name;
          const state = stateOf(listing, name, capability);
          if (isPending) {
            return <Skeleton width={90} height={16} />;
          }
          return state ? (
            <StateTag
              state={state}
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
