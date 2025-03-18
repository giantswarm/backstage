import { Deployment, Resource } from '@giantswarm/backstage-plugin-gs-common';

export type FacetFilter = {
  getFilters?: () => Record<string, string | symbol | (string | symbol)[]>;

  filter: (item: Resource<Deployment>) => boolean;

  toQueryValue?: () => string | string[];
};

export class KindFilter implements FacetFilter {
  constructor(readonly value: string[]) {}

  getFilters(): Record<string, string | string[]> {
    return { kind: this.value };
  }

  filter(item: Resource<Deployment>): boolean {
    const { installationName, ...deployment } = item;
    if (this.value.length === 0) {
      return true;
    }

    return this.value.includes(deployment.kind.toLocaleLowerCase('en-US'));
  }

  toQueryValue(): string[] {
    return Array.isArray(this.value) ? this.value : [this.value];
  }
}
