/**
 * InstallationsIndexPage component is based on the DefaultCatalogPage.tsx - https://github.com/backstage/backstage/blob/v1.16.0/plugins/catalog/src/components/CatalogPage/DefaultCatalogPage.tsx
 */

import {
  Content,
  ContentHeader,
  PageWithHeader,
  SupportButton,
  TableColumn,
  TableProps,
} from '@backstage/core-components';
import {
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  Typography,
} from '@material-ui/core';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import {
  CatalogFilterLayout,
  EntityListProvider,
  EntityTypePicker,
  UserListFilterKind,
  EntityKindPicker,
  EntityOwnerPickerProps,
  EntityFilter,
  DefaultEntityFilters,
  useEntityList,
} from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import {
  CatalogTable,
  CatalogTableColumnsFunc,
  CatalogTableRow,
} from '@backstage/plugin-catalog';
import React, { ReactNode } from 'react';
import { CustomCatalogTable } from './CustomCatalogTable';

class EntityProviderFilter implements EntityFilter {
  constructor(readonly values: string[]) {}
  filterEntity(entity: Entity): boolean {
    const provider = entity.metadata.labels?.['giantswarm.io/provider'];
    return provider !== undefined && this.values.includes(provider);
  }
}

class EntityPipelineFilter implements EntityFilter {
  constructor(readonly values: string[]) {}
  filterEntity(entity: Entity): boolean {
    const pipeline = entity.metadata.labels?.['giantswarm.io/pipeline'];
    return pipeline !== undefined && this.values.includes(pipeline);
  }
}

type CustomFilters = DefaultEntityFilters & {
  providers?: EntityProviderFilter;
  pipelines?: EntityPipelineFilter;
};

// TODO: move these into a common place, where they canb be used for the entity page, too
const providerOptions: { [key: string]: string } = {
  capa: 'CAPA',
  capv: 'CAPV',
  capz: 'CAPZ',
  aws: 'AWS vintage',
  'cloud-director': 'Cloud Director vintage',
  vsphere: 'VSphere vintage',
  kvm: 'KVM',
};
const pipelineOptions = ['testing', 'stable', 'stable-testing', 'ephemeral'];

const columnsFunc: CatalogTableColumnsFunc = entityListContext => {
  if (entityListContext.filters.kind?.value === 'Resource') {
    return [
      CatalogTable.columns.createNameColumn({ defaultKind: 'resource' }),
      {
        title: 'Customer',
        render: ({ entity }) =>
          entity.metadata?.labels?.['giantswarm.io/customer'] ?? 'N/A',
      },
      {
        title: 'Provider',
        render: ({ entity }) =>
          <code>{entity.metadata?.labels?.['giantswarm.io/provider']}</code> ??
          'N/A',
      },
      {
        title: 'Pipeline',
        render: ({ entity }) =>
          <code>{entity.metadata?.labels?.['giantswarm.io/pipeline']}</code> ??
          'N/A',
      },
      {
        title: 'Region',
        render: ({ entity }) =>
          entity.metadata?.labels?.['giantswarm.io/region'] ?? '',
      },
    ];
  }

  return CatalogTable.defaultColumnsFunc(entityListContext);
};

const EntityProviderPicker = () => {
  // The providers key is recognized due to the CustomFilter generic
  const {
    filters: { providers },
    updateFilters,
  } = useEntityList<CustomFilters>();

  // Toggles the value, depending on whether it's already selected
  function onChange(value: string) {
    const newProviders = providers?.values.includes(value)
      ? providers.values.filter(provider => provider !== value)
      : [...(providers?.values ?? []), value];
    updateFilters({
      providers: newProviders.length
        ? new EntityProviderFilter(newProviders)
        : undefined,
    });
  }

  return (
    <div>
      <FormControl component="fieldset">
        <Typography variant="button">Provider</Typography>
        <FormGroup>
          {Object.keys(providerOptions).map(key => (
            <FormControlLabel
              key={key}
              control={
                <Checkbox
                  checked={providers?.values.includes(key)}
                  onChange={() => onChange(key)}
                />
              }
              label={providerOptions[key]}
            />
          ))}
        </FormGroup>
      </FormControl>
    </div>
  );
};

const EntityPipelinePicker = () => {
  // The pipelines key is recognized due to the CustomFilter generic
  const {
    filters: { pipelines },
    updateFilters,
  } = useEntityList<CustomFilters>();

  // Toggles the value, depending on whether it's already selected
  function onChange(value: string) {
    const newPipelines = pipelines?.values.includes(value)
      ? pipelines.values.filter(pipeline => pipeline !== value)
      : [...(pipelines?.values ?? []), value];
    updateFilters({
      pipelines: newPipelines.length
        ? new EntityPipelineFilter(newPipelines)
        : undefined,
    });
  }

  return (
    <div>
      <FormControl component="fieldset">
        <Typography variant="button">Pipeline</Typography>
        <FormGroup>
          {pipelineOptions.map(key => (
            <FormControlLabel
              key={key}
              control={
                <Checkbox
                  checked={pipelines?.values.includes(key)}
                  onChange={() => onChange(key)}
                />
              }
              label={key}
            />
          ))}
        </FormGroup>
      </FormControl>
    </div>
  );
};

/**
 * Props for root catalog pages.
 *
 * @public
 */
export interface InstallationsIndexPageProps {
  initiallySelectedFilter?: UserListFilterKind;
  columns?: TableColumn<CatalogTableRow>[];
  actions?: TableProps<CatalogTableRow>['actions'];
  initialKind?: string;
  initialType?: string;
  tableOptions?: TableProps<CatalogTableRow>['options'];
  emptyContent?: ReactNode;
  ownerPickerMode?: EntityOwnerPickerProps['mode'];
}

export function InstallationsIndexPage(props: InstallationsIndexPageProps) {
  const {
    columns = columnsFunc,
    actions,
    initialKind = 'Resource',
    initialType = 'installation',
    tableOptions = { padding: 'dense', pageSize: 50 },
    emptyContent,
  } = props;
  const orgName =
    useApi(configApiRef).getOptionalString('organization.name') ?? 'Backstage';

  return (
    <PageWithHeader title={`${orgName} Catalog`} themeId="home">
      <Content>
        <ContentHeader title="Installations">
          <SupportButton>Installations</SupportButton>
        </ContentHeader>
        <EntityListProvider>
          <CatalogFilterLayout>
            <CatalogFilterLayout.Filters>
              <EntityKindPicker initialFilter={initialKind} hidden />
              <EntityTypePicker initialFilter={initialType} hidden />
              <EntityProviderPicker />
              <EntityPipelinePicker />
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
