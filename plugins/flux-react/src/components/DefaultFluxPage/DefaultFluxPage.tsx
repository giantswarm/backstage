import { ReactNode } from 'react';
import { FluxPageLayout } from '../FluxPageLayout';
import { FluxResourcesTreeView } from '../FluxResourcesTreeView';
import { FluxResourcesListView } from '../FluxResourcesListView';

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
    <FluxPageLayout>
      <FluxPageLayout.Route path="/" title="Tree view">
        <FluxResourcesTreeView filters={treeViewFilters} />
      </FluxPageLayout.Route>

      <FluxPageLayout.Route path="/list" title="List view">
        <FluxResourcesListView filters={listViewFilters} />
      </FluxPageLayout.Route>
    </FluxPageLayout>
  );
}
