/**
 * InstallationsPage component is based on the DefaultCatalogPage.tsx - https://github.com/backstage/backstage/blob/v1.16.0/plugins/catalog/src/components/CatalogPage/DefaultCatalogPage.tsx
 */

import { Content, TableProps } from '@backstage/core-components';

import {
  CatalogFilterLayout,
  EntityListProvider,
  EntityTypePicker,
  EntityKindPicker,
} from '@backstage/plugin-catalog-react';
import {
  CatalogTable,
  CatalogTableColumnsFunc,
  CatalogTableRow,
} from '@backstage/plugin-catalog';
import { ReactNode, useCallback } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Box, Tab, TabList, Tabs } from '@backstage/ui';
import { useInstallationCapabilityColumns } from '@giantswarm/backstage-plugin-platform-capabilities';
import { useSplatBasePath } from '@giantswarm/backstage-plugin-ui-react';
import { CustomCatalogTable } from '../CustomCatalogTable';
import { EntityProviderPicker } from '../EntityProviderPicker';
import { EntityPipelinePicker } from '../EntityPipelinePicker';
import { EntityCustomerPicker } from '../EntityCustomerPicker';
import {
  autoWidthColumn,
  columnFactories,
  hiddenColumn,
  noWrapColumn,
} from '../columns';
import { InstallationsConsistency } from './InstallationsConsistency';

const baseColumns: CatalogTableColumnsFunc = () => {
  return [
    autoWidthColumn(
      CatalogTable.columns.createNameColumn({ defaultKind: 'resource' }),
    ),
    noWrapColumn(columnFactories.createCustomerColumn()),
    noWrapColumn(columnFactories.createProviderColumn()),
    noWrapColumn(columnFactories.createPipelineColumn()),
    noWrapColumn(columnFactories.createRegionColumn()),
    hiddenColumn(columnFactories.createBaseColumn()),
    hiddenColumn(columnFactories.createAccountEngineerColumn()),
  ];
};

export interface InstallationsPageProps {
  tableOptions?: TableProps<CatalogTableRow>['options'];
  emptyContent?: ReactNode;
}

/** The Consistency view's path under the page, per capability. */
export const consistencyPath = (capability: string) =>
  `consistency/${encodeURIComponent(capability)}`;

export function InstallationsPage(props: InstallationsPageProps) {
  const {
    tableOptions = {
      padding: 'dense',
      pageSize: 50,
      emptyRowsWhenPaging: false,
    },
    emptyContent,
  } = props;

  // One column per platform capability with its state on the installation,
  // from giantswarm-platform-manager through muster as the signed-in person;
  // none where the platform-capabilities api is not enabled (a customer
  // portal). The Capabilities tab of an installation holds the actions; the
  // Consistency view per capability, a tab of this page, holds the comparison
  // of every installation with the definition.
  const capabilities = useInstallationCapabilityColumns();
  const columnsFunc: CatalogTableColumnsFunc = useCallback(
    context => [...baseColumns(context), ...capabilities.columns],
    [capabilities.columns],
  );
  const basePath = useSplatBasePath();

  const list = (
    <EntityListProvider>
      <CatalogFilterLayout>
        <CatalogFilterLayout.Filters>
          <EntityKindPicker initialFilter="resource" hidden />
          <EntityTypePicker initialFilter="installation" hidden />
          <EntityCustomerPicker />
          <EntityProviderPicker />
          <EntityPipelinePicker />
        </CatalogFilterLayout.Filters>
        <CatalogFilterLayout.Content>
          <CustomCatalogTable
            columns={columnsFunc}
            tableOptions={tableOptions}
            emptyContent={emptyContent}
          />
        </CatalogFilterLayout.Content>
      </CatalogFilterLayout>
    </EntityListProvider>
  );

  return (
    <Content>
      {capabilities.notice}
      {/* The tab strip appears with the first capability the manager knows;
          a customer portal, without the api, keeps the plain list. */}
      {capabilities.capabilities.length > 0 && (
        <Box mb="4">
          <Tabs>
            <TabList>
              <Tab
                id="installations"
                href={basePath || '/'}
                matchStrategy="exact"
              >
                Installations
              </Tab>
              {capabilities.capabilities.map(capability => (
                <Tab
                  key={capability}
                  id={`consistency-${capability}`}
                  href={`${basePath}/${consistencyPath(capability)}`}
                  matchStrategy="prefix"
                >
                  Consistency: {capability}
                </Tab>
              ))}
            </TabList>
          </Tabs>
        </Box>
      )}
      <Routes>
        <Route
          path="consistency/:capability"
          element={<InstallationsConsistency />}
        />
        <Route path="*" element={list} />
      </Routes>
    </Content>
  );
}
