/**
 * CustomCatalogPage component is based on the DefaultCatalogPage.tsx - https://github.com/backstage/backstage/blob/v1.16.0/plugins/catalog/src/components/CatalogPage/DefaultCatalogPage.tsx
 */

import {
  Content,
  ContentHeader,
  PageWithHeader,
  SupportButton,
  TableColumn,
  TableProps,
} from '@backstage/core-components';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import {
  CatalogFilterLayout,
  EntityLifecyclePicker,
  EntityListProvider,
  EntityOwnerPicker,
  EntityTagPicker,
  EntityTypePicker,
  UserListFilterKind,
  UserListPicker,
  EntityKindPicker,
  EntityNamespacePicker,
  EntityOwnerPickerProps,
} from '@backstage/plugin-catalog-react';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import React, { ReactNode } from 'react';
import { CustomCatalogTable } from './CustomCatalogTable';

/**
 * Props for root catalog pages.
 *
 * @public
 */
export interface CustomCatalogPageProps {
  initiallySelectedFilter?: UserListFilterKind;
  columns?: TableColumn<CatalogTableRow>[];
  actions?: TableProps<CatalogTableRow>['actions'];
  initialKind?: string;
  tableOptions?: TableProps<CatalogTableRow>['options'];
  emptyContent?: ReactNode;
  ownerPickerMode?: EntityOwnerPickerProps['mode'];
}

export function CustomCatalogPage(props: CustomCatalogPageProps) {
  const {
    columns,
    actions,
    initialKind = 'component',
    tableOptions = {},
    emptyContent,
    ownerPickerMode,
  } = props;
  const orgName =
    useApi(configApiRef).getOptionalString('organization.name') ?? 'Backstage';

  return (
    <PageWithHeader title={`${orgName} Catalog`} themeId="home">
      <Content>
        <ContentHeader title="">
          <SupportButton>All your software catalog entities</SupportButton>
        </ContentHeader>
        <EntityListProvider>
          <CatalogFilterLayout>
            <CatalogFilterLayout.Filters>
              <EntityKindPicker initialFilter={initialKind} />
              <EntityTypePicker />
              <UserListPicker />
              <EntityOwnerPicker mode={ownerPickerMode} />
              <EntityLifecyclePicker />
              <EntityTagPicker />
              <EntityNamespacePicker />
            </CatalogFilterLayout.Filters>
            <CatalogFilterLayout.Content>
              <CustomCatalogTable
                columns={columns}
                actions={actions}
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
