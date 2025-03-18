import {
  Cluster,
  isManagementCluster,
  Resource,
} from '@giantswarm/backstage-plugin-gs-common';
import { FacetFilter } from '../../../hooks';

export class KindFilter implements FacetFilter {
  constructor(readonly value: string[]) {}

  getFilters(): Record<string, string | string[]> {
    return { kind: this.value };
  }

  filter(item: Resource<Cluster>): boolean {
    if (this.value.length === 0) {
      return true;
    }

    const { installationName, ...cluster } = item;
    const kind = isManagementCluster(cluster, installationName) ? 'mc' : 'wc';

    return this.value.includes(kind);
  }

  toQueryValue(): string[] {
    return Array.isArray(this.value) ? this.value : [this.value];
  }
}
