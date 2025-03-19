import { FacetFilter } from '../../../hooks';
import { ClusterData } from '../../ClustersDataProvider';
import { ClusterTypes } from '../../utils';
import { MC_VALUE, WC_VALUE } from './KindPicker/KindPicker';

export class KindFilter implements FacetFilter {
  constructor(readonly value: string[]) {}

  filter(item: ClusterData): boolean {
    if (this.value.length === 0) {
      return true;
    }

    const kind = item.type === ClusterTypes.Management ? MC_VALUE : WC_VALUE;

    return this.value.includes(kind);
  }

  toQueryValue(): string[] {
    return Array.isArray(this.value) ? this.value : [this.value];
  }
}
