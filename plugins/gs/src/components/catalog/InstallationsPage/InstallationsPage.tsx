/**
 * InstallationsPage component is based on the DefaultCatalogPage.tsx - https://github.com/backstage/backstage/blob/v1.16.0/plugins/catalog/src/components/CatalogPage/DefaultCatalogPage.tsx
 */

import {
  Content,
  ContentHeader,
  PageWithHeader,
  SupportButton,
  TableProps,
} from '@backstage/core-components';

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
import React, { ReactNode } from 'react';
import { CustomCatalogTable } from '../CustomCatalogTable';
import { EntityProviderPicker } from '../EntityProviderPicker';
import { EntityPipelinePicker } from '../EntityPipelinePicker';
import { EntityCustomerPicker } from '../EntityCustomerPicker';
import { autoWidthColumn, columnFactories, noWrapColumn } from '../columns';

const columnsFunc: CatalogTableColumnsFunc = () => {
  return [
    autoWidthColumn(
      CatalogTable.columns.createNameColumn({ defaultKind: 'resource' }),
    ),
    noWrapColumn(columnFactories.createCustomerColumn()),
    noWrapColumn(columnFactories.createProviderColumn()),
    noWrapColumn(columnFactories.createPipelineColumn()),
    noWrapColumn(columnFactories.createRegionColumn()),
  ];
};

export interface InstallationsPageProps {
  tableOptions?: TableProps<CatalogTableRow>['options'];
  emptyContent?: ReactNode;
}

export function InstallationsPage(props: InstallationsPageProps) {
  const {
    tableOptions = {
      padding: 'dense',
      pageSize: 50,
      emptyRowsWhenPaging: false,
    },
    emptyContent,
  } = props;

  return (
    <PageWithHeader title="Installations" themeId="home">
      <Content>
        <ContentHeader title="">
          <SupportButton>Installations</SupportButton>
        </ContentHeader>
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
      </Content>
    </PageWithHeader>
  );
}
