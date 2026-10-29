import { ReactNode } from 'react';
import {
  ConditionMessage,
  DateComponent,
} from '@giantswarm/backstage-plugin-ui-react';

export type Metadata = { [key: string]: ReactNode };

type ReadyCondition = {
  status: string;
  lastTransitionTime?: string;
  message?: string;
};

export function buildStatusMetadata(
  readyCondition: ReadyCondition | undefined,
): Metadata {
  const metadata: Metadata = {};

  if (readyCondition) {
    if (readyCondition.status === 'False') {
      metadata.Status = (
        <>
          Last reconciliation failed{' '}
          <DateComponent value={readyCondition.lastTransitionTime} relative />
        </>
      );
    } else {
      metadata.Status = (
        <>
          Last reconciled{' '}
          <DateComponent value={readyCondition.lastTransitionTime} relative />
        </>
      );
    }
    metadata.Message = (
      <ConditionMessage message={readyCondition.message ?? ''} />
    );
  } else {
    metadata.Status = 'Unknown';
  }

  return metadata;
}
