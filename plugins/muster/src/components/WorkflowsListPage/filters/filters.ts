import { FacetFilter } from '@giantswarm/backstage-plugin-ui-react';
import { WorkflowRow } from '../WorkflowsDataProvider';

export const STATUS_VALID = 'valid';
export const STATUS_WARNING = 'warning';

export class StatusFilter implements FacetFilter {
  constructor(readonly values: string[]) {}

  filter(item: WorkflowRow): boolean {
    if (this.values.length === 0) {
      return true;
    }

    return (
      (this.values.includes(STATUS_VALID) && item.valid) ||
      (this.values.includes(STATUS_WARNING) && item.validationWarning)
    );
  }

  toQueryValue(): string[] {
    return this.values;
  }
}

export class NamespaceFilter implements FacetFilter {
  constructor(readonly values: string[]) {}

  filter(item: WorkflowRow): boolean {
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

export class SourceFilter implements FacetFilter {
  constructor(readonly values: string[]) {}

  filter(item: WorkflowRow): boolean {
    if (this.values.length === 0) {
      return true;
    }

    return this.values.includes(item.source);
  }

  toQueryValue(): string[] {
    return this.values;
  }
}
