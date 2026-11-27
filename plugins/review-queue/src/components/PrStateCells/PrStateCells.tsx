import { Skeleton } from '@backstage/ui';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import {
  StatusLabel,
  type StatusLabelIntent,
} from '@giantswarm/backstage-plugin-ui-react';

import type {
  CiState,
  MergeState,
  PrState,
  ReviewState,
} from '../../lib/github';
import type { PrStateEntry } from '../../hooks/usePrStates';

type Shown = {
  label: string;
  intent: StatusLabelIntent;
  title: string;
  waiting?: boolean;
};

export function ciShown(ci: PrState['ci']): Shown {
  const shown: Record<CiState, Shown> = {
    passing: {
      label: 'Passing',
      intent: 'positive',
      title: `All ${ci.total} checks passed`,
    },
    failing: {
      label: 'Failing',
      intent: 'negative',
      title: `Failing: ${ci.failing.join(', ')}`,
    },
    running: {
      label: 'Running',
      intent: 'info',
      title: `${ci.running} of ${ci.total} checks still running`,
      waiting: true,
    },
    none: {
      label: 'No checks',
      intent: 'neutral',
      title: 'No check or status reported on the head commit',
    },
  };
  return shown[ci.state];
}

export function reviewShown(review: PrState['review']): Shown {
  const shown: Record<ReviewState, Shown> = {
    approved: {
      label:
        review.approvals > 1 ? `Approved ×${review.approvals}` : 'Approved',
      intent: 'positive',
      title: `${review.approvals} approving review${
        review.approvals === 1 ? '' : 's'
      }`,
    },
    changes_requested: {
      label: 'Changes',
      intent: 'negative',
      title: `Changes requested by ${review.changesBy.join(', ')}`,
    },
    none: {
      label: 'None',
      intent: 'neutral',
      title: 'No approving or blocking review yet',
    },
  };
  return shown[review.state];
}

export function mergeShown(merge: PrState['merge']): Shown {
  const shown: Record<MergeState, Shown> = {
    ready: {
      label: 'Ready',
      intent: 'positive',
      title:
        merge.raw === 'unstable'
          ? 'Mergeable; checks that are not required are failing'
          : 'Mergeable',
    },
    conflicts: {
      label: 'Conflicts',
      intent: 'negative',
      title: 'Conflicts with the base branch',
    },
    blocked: {
      label: 'Blocked',
      intent: 'warning',
      title:
        'Branch protection blocks it: a required review or check is missing',
    },
    behind: {
      label: 'Behind',
      intent: 'warning',
      title: 'The base branch moved on: update the branch to merge',
    },
    draft: {
      label: 'Draft',
      intent: 'neutral',
      title: 'A draft does not merge until it is marked ready',
    },
    checking: {
      label: 'Checking',
      intent: 'neutral',
      title:
        'GitHub is still computing whether it merges; Refresh reads it again',
      waiting: true,
    },
  };
  return shown[merge.state];
}

/** One of the three state icons of a row, its loading and its failure. */
export function PrStateLabel({
  entry,
  shownOf,
}: {
  entry: PrStateEntry | undefined;
  shownOf: (state: PrState) => Shown;
}) {
  if (!entry || entry.isLoading) {
    return <Skeleton width={72} height={16} />;
  }
  if (entry.error) {
    return (
      <StatusLabel
        label="Unknown"
        intent="neutral"
        title={`Could not read it: ${entry.error.message}`}
      />
    );
  }
  if (!entry.state) {
    return null;
  }
  const shown = shownOf(entry.state);
  return (
    <StatusLabel
      label={shown.label}
      intent={shown.intent}
      title={shown.title}
      icon={shown.waiting ? HourglassEmptyIcon : undefined}
    />
  );
}
