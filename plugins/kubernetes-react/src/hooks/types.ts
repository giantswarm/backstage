import { Query } from '@tanstack/react-query';

export type QueryOptions<T> = {
  enabled?: boolean;
  refetchInterval?:
    | number
    | false
    | ((query: Query<T>) => number | false | undefined);
};
