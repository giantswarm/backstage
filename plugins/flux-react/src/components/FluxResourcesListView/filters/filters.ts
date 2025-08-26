import { FacetFilter } from '@giantswarm/backstage-plugin-ui-react';
import { FluxResourceData } from '../../FluxResourcesDataProvider';
import { getAggregatedStatus } from '../../../utils/getAggregatedStatus';

export class KindFilter implements FacetFilter {
  constructor(readonly values: string[]) {}

  filter(item: FluxResourceData): boolean {
    if (this.values.length === 0) {
      return true;
    }

    return this.values.includes(item.kind);
  }

  toQueryValue(): string[] {
    return this.values;
  }
}

export class StatusFilter implements FacetFilter {
  constructor(readonly values: string[]) {}

  filter(item: FluxResourceData): boolean {
    if (this.values.length === 0) {
      return true;
    }

    const aggregatedStatus = getAggregatedStatus(item.status);

    return this.values.includes(aggregatedStatus);
  }

  toQueryValue(): string[] {
    return this.values;
  }
}
