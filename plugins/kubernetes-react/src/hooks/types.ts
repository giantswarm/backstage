import { Query } from '@tanstack/react-query';
import * as k8sUrl from './utils/k8sUrl';

export type Options = {
  namespace?: string;
  labelSelector?: k8sUrl.IK8sLabelSelector;
};

export type QueryOptions<T> = {
  enabled?: boolean;
  refetchInterval?:
    | number
    | false
    | ((query: Query<T>) => number | false | undefined);
};
