import { FacetFilter } from '../../../hooks';
import { DeploymentData } from '../../DeploymentsDataProvider';
import { APP_VALUE, HELM_RELEASE_VALUE } from './KindPicker/KindPicker';

export class KindFilter implements FacetFilter {
  constructor(readonly values: string[]) {}

  filter(item: DeploymentData): boolean {
    if (this.values.length === 0) {
      return true;
    }

    const kind = item.kind === 'app' ? APP_VALUE : HELM_RELEASE_VALUE;

    return this.values.includes(kind);
  }

  toQueryValue(): string[] {
    return Array.isArray(this.values) ? this.values : [this.values];
  }
}

export class TargetClusterFilter implements FacetFilter {
  constructor(readonly values: string[]) {}

  filter(item: DeploymentData): boolean {
    if (this.values.length === 0) {
      return true;
    }

    return this.values.includes(`${item.installationName}/${item.clusterName}`);
  }

  toQueryValue(): string[] {
    return this.values;
  }
}
