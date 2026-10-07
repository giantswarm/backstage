import { Progress } from '@backstage/core-components';
import { PlansErrorAlert } from '../PlansErrorAlert';

/**
 * A Hive view's source while it has no data: the progress bar while it
 * loads, its own error with a "Try again" once it failed. Only the view whose source failed
 * shows the error; the header and every other tab still render.
 */
export function HiveSourceState(props: {
  isLoading: boolean;
  error: unknown;
  /** What failed to load, in prose: "what the team works on now". */
  what: string;
  /** Loads the source again: the error's "Try again". */
  onRetry: () => void;
  isFetching: boolean;
}) {
  if (props.error) {
    return (
      <PlansErrorAlert
        title={`Failed to load ${props.what}`}
        error={props.error as Error}
        onRetry={props.onRetry}
        retrying={props.isFetching}
      />
    );
  }
  return props.isLoading ? <Progress /> : null;
}
