import { Entity } from '@backstage/catalog-model';
import {
  DefaultEntityFilters,
  EntityFilter,
  EntityLifecycleFilter,
  EntityNamespaceFilter,
  EntityOrphanFilter,
  EntityOwnerFilter,
  EntityTagFilter,
  EntityTextFilter,
  EntityUserFilter,
  UserListFilter,
} from '@backstage/plugin-catalog-react';

export class EntityCustomerFilter implements EntityFilter {
  constructor(readonly value: string | string[]) {}

  getCustomers(): string[] {
    return Array.isArray(this.value) ? this.value : [this.value];
  }

  getCatalogFilters(): Record<string, string | string[]> {
    return { 'metadata.labels.giantswarm.io/customer': this.getCustomers() };
  }

  toQueryValue(): string[] {
    return this.getCustomers();
  }
}

export class EntityPipelineFilter implements EntityFilter {
  constructor(readonly values: string[]) {}

  getCatalogFilters(): Record<string, string | string[]> {
    return { 'metadata.labels.giantswarm.io/pipeline': this.values };
  }

  filterEntity(entity: Entity): boolean {
    return this.values.some(
      v => entity.metadata.labels?.['giantswarm.io/pipeline'] === v,
    );
  }

  toQueryValue(): string[] {
    return this.values;
  }
}

export class EntityProviderFilter implements EntityFilter {
  constructor(readonly values: string[]) {}

  getCatalogFilters(): Record<string, string | string[]> {
    return { 'metadata.labels.giantswarm.io/provider': this.values };
  }

  filterEntity(entity: Entity): boolean {
    return this.values.some(
      v => entity.metadata.labels?.['giantswarm.io/provider'] === v,
    );
  }

  toQueryValue(): string[] {
    return this.values;
  }
}

export type CustomFilters = DefaultEntityFilters & {
  customer?: EntityCustomerFilter;
  pipelines?: EntityPipelineFilter;
  providers?: EntityProviderFilter;
};

/**
 * This function computes and returns an object containing the filters to be sent
 * to the backend. Any filter coming from `EntityKindFilter` and `EntityTypeFilter`, together
 * with custom filter set by the adopters is allowed. This function is used by `EntityListProvider`
 * and it won't be needed anymore in the future once pagination is implemented, as all the filters
 * will be applied backend-side.
 */
export function reduceBackendCatalogFilters(filters: EntityFilter[]) {
  const backendCatalogFilters: Record<
    string,
    string | symbol | (string | symbol)[]
  > = {};

  filters.forEach(filter => {
    if (
      filter instanceof EntityTagFilter ||
      filter instanceof EntityOwnerFilter ||
      filter instanceof EntityLifecycleFilter ||
      filter instanceof EntityNamespaceFilter ||
      filter instanceof EntityUserFilter ||
      filter instanceof EntityOrphanFilter ||
      filter instanceof EntityTextFilter ||
      filter instanceof UserListFilter
    ) {
      return;
    }
    Object.assign(backendCatalogFilters, filter.getCatalogFilters?.() || {});
  });

  return backendCatalogFilters;
}
