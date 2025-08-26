import { ReactNode } from 'react';
import { useRouteRef } from '@backstage/core-plugin-api';
import { rootRouteRef } from '../../routes';
import { FluxPageLayout } from '../FluxPageLayout';
import {
  FluxResourcesListView,
  FluxResourcesTreeView,
} from '@giantswarm/backstage-plugin-flux-react';

export type BaseFluxPageProps = {
  treeViewFilters: ReactNode;
  listViewFilters: ReactNode;
};

export function BaseFluxPage({
  treeViewFilters,
  listViewFilters,
}: BaseFluxPageProps) {
  const getBasePath = useRouteRef(rootRouteRef);
  const basePath = getBasePath();

  return (
    <FluxPageLayout>
      <FluxPageLayout.Route path="/" title="Tree view">
        <FluxResourcesTreeView basePath={basePath} filters={treeViewFilters} />
      </FluxPageLayout.Route>

      <FluxPageLayout.Route path="/list" title="List view">
        <FluxResourcesListView
          basePath={`${basePath}/list`}
          filters={listViewFilters}
        />
      </FluxPageLayout.Route>
    </FluxPageLayout>
  );
}

export interface DefaultFluxPageProps {
  emptyContent?: ReactNode;
  treeViewFilters?: ReactNode;
  listViewFilters?: ReactNode;
}

export function DefaultFluxPage({
  treeViewFilters,
  listViewFilters,
}: DefaultFluxPageProps) {
  return (
    <BaseFluxPage
      treeViewFilters={treeViewFilters}
      listViewFilters={listViewFilters}
    />
  );
}
