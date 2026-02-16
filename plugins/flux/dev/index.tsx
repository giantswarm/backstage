import { createDevApp } from '@backstage/dev-utils';
import {
  FluxResourcesListViewClusterPicker,
  FluxResourcesListViewKindPicker,
  FluxResourcesListViewStatusPicker,
  FluxResourcesTreeViewClusterPicker,
  FluxResourcesTreeViewResourceTypePicker,
  FluxResourcesTreeViewTreeSearch,
} from '@giantswarm/backstage-plugin-flux-react';
import { FluxPage } from '../src/components/FluxPage';

createDevApp()
  .addPage({
    element: (
      <FluxPage
        listFilters={
          <>
            <FluxResourcesListViewClusterPicker />
            <FluxResourcesListViewKindPicker />
            <FluxResourcesListViewStatusPicker />
          </>
        }
        treeFilters={
          <>
            <FluxResourcesTreeViewClusterPicker />
            <FluxResourcesTreeViewResourceTypePicker />
            <FluxResourcesTreeViewTreeSearch />
          </>
        }
      />
    ),
    title: 'Root Page',
    path: '/flux',
  })
  .render();
