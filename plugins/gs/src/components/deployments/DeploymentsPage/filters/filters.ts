import { FacetFilter } from '@giantswarm/backstage-plugin-ui-react';
import { ClusterTypes } from '../../../clusters/utils';
import { DeploymentData } from '../../DeploymentsDataProvider';
import { APP_VALUE, HELM_RELEASE_VALUE } from './KindPicker/KindPicker';
import {
  MC_VALUE,
  WC_VALUE,
} from './TargetClusterKindPicker/TargetClusterKindPicker';

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

export class TargetClusterKindFilter implements FacetFilter {
  constructor(readonly values: string[]) {}

  filter(item: DeploymentData): boolean {
    if (this.values.length === 0) {
      return true;
    }

    if (!item.clusterType) {
      return false;
    }

    const kind =
      item.clusterType === ClusterTypes.Management ? MC_VALUE : WC_VALUE;

    return this.values.includes(kind);
  }

  toQueryValue(): string[] {
    return this.values;
  }
}

export class VersionFilter implements FacetFilter {
  constructor(readonly values: string[]) {}

  filter(item: DeploymentData): boolean {
    if (this.values.length === 0) {
      return true;
    }

    if (item.version === '') {
      return false;
    }

    return this.values.includes(item.version);
  }

  toQueryValue(): string[] {
    return this.values;
  }
}

export class NamespaceFilter implements FacetFilter {
  constructor(readonly values: string[]) {}

  filter(item: DeploymentData): boolean {
    if (this.values.length === 0) {
      return true;
    }

    if (!item.namespace) {
      return false;
    }

    return this.values.includes(item.namespace);
  }

  toQueryValue(): string[] {
    return this.values;
  }
}

export class StatusFilter implements FacetFilter {
  constructor(readonly values: string[]) {}

  filter(item: DeploymentData): boolean {
    if (this.values.length === 0) {
      return true;
    }

    if (!item.status) {
      return false;
    }

    return this.values.includes(item.status);
  }

  toQueryValue(): string[] {
    return this.values;
  }
}

export class LabelFilter implements FacetFilter {
  constructor(readonly values: string[]) {}

  filter(item: DeploymentData): boolean {
    if (this.values.length === 0) {
      return true;
    }

    if (!item.labels || item.labels.length === 0) {
      return false;
    }

    return item.labels.some(label => this.values.includes(label));
  }

  toQueryValue(): string[] {
    return this.values;
  }
}

export class AppFilter implements FacetFilter {
  constructor(readonly values: string[]) {}

  filter(item: DeploymentData): boolean {
    if (this.values.length === 0) {
      return true;
    }

    if (!item.app) {
      return false;
    }

    return this.values.includes(item.app);
  }

  toQueryValue(): string[] {
    return this.values;
  }
}
