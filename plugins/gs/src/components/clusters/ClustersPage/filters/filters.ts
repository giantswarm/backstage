import { FacetFilter } from '../../../hooks';
import { ClusterData } from '../../ClustersDataProvider';
import { ClusterTypes } from '../../utils';
import { MC_VALUE, WC_VALUE } from './KindPicker/KindPicker';

export class KindFilter implements FacetFilter {
  constructor(readonly values: string[]) {}

  filter(item: ClusterData): boolean {
    if (this.values.length === 0) {
      return true;
    }

    const kind = item.type === ClusterTypes.Management ? MC_VALUE : WC_VALUE;

    return this.values.includes(kind);
  }

  toQueryValue(): string[] {
    return Array.isArray(this.values) ? this.values : [this.values];
  }
}
