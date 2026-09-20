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
import { useInstallationCapabilityColumns } from '@giantswarm/backstage-plugin-platform-capabilities';
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
  // portal). The Capabilities tab of an installation holds the actions.
  const capabilities = useInstallationCapabilityColumns();
  const columnsFunc: CatalogTableColumnsFunc = useCallback(
    context => [...baseColumns(context), ...capabilities.columns],
    [capabilities.columns],
  );

  return (
    <Content>
      {capabilities.notice}
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
  );
}
