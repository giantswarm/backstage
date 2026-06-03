import { createDevApp } from '@backstage/dev-utils';
import {
  FluxResourcesListViewClusterPicker,
  FluxResourcesListViewKindPicker,
  FluxResourcesListViewStatusPicker,
  FluxResourcesTreeViewClusterPicker,
  FluxResourcesTreeViewResourceTypePicker,
  FluxResourcesTreeViewTreeSearch,
} from '@giantswarm/backstage-plugin-flux-react';
import { FluxResourcesListPage } from '../src/components/FluxResourcesListPage';
import { FluxResourcesTreePage } from '../src/components/FluxResourcesTreePage';

createDevApp()
  .addPage({
    element: (
      <FluxResourcesListPage
        filters={
          <>
            <FluxResourcesListViewClusterPicker />
            <FluxResourcesListViewKindPicker />
            <FluxResourcesListViewStatusPicker />
          </>
        }
      />
    ),
    title: 'List view',
    path: '/flux/list',
  })
  .addPage({
    element: (
      <FluxResourcesTreePage
        filters={
          <>
            <FluxResourcesTreeViewClusterPicker />
            <FluxResourcesTreeViewResourceTypePicker />
            <FluxResourcesTreeViewTreeSearch />
          </>
        }
      />
    ),
    title: 'Tree view',
    path: '/flux/tree',
  })
  .render();
