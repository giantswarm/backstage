import {
  ErrorInfoUnion,
  getIncompatibilityMessage,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { describeClusterError } from '../../clusters/ClustersDataProvider/utils';

export function describeErrors(errors: ErrorInfoUnion[], what: string): string {
  return errors
    .map(errorInfo =>
      errorInfo.type === 'incompatibility'
        ? getIncompatibilityMessage(errorInfo.incompatibility)
        : `Could not read the ${what}: ${describeClusterError(errorInfo.error)}.`,
    )
    .join(' ');
}
