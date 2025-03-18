import { FacetFilter } from '../../../hooks';
import { DeploymentData } from '../../DeploymentsDataProvider';

export class KindFilter implements FacetFilter {
  constructor(readonly value: string[]) {}

  filter(item: DeploymentData): boolean {
    if (this.value.length === 0) {
      return true;
    }

    return this.value.includes(item.kind);
  }

  toQueryValue(): string[] {
    return Array.isArray(this.value) ? this.value : [this.value];
  }
}
