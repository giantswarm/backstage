import { FacetFilter } from '../../../hooks';
import { DeploymentData } from '../../DeploymentsDataProvider';
import { APP_VALUE, HELM_RELEASE_VALUE } from './KindPicker/KindPicker';

export class KindFilter implements FacetFilter {
  constructor(readonly value: string[]) {}

  filter(item: DeploymentData): boolean {
    if (this.value.length === 0) {
      return true;
    }

    const kind = item.kind === 'app' ? APP_VALUE : HELM_RELEASE_VALUE;

    return this.value.includes(kind);
  }

  toQueryValue(): string[] {
    return Array.isArray(this.value) ? this.value : [this.value];
  }
}
