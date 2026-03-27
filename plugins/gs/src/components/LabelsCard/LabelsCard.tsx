import { useState } from 'react';
import { Switch } from '@backstage/ui';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { Typography } from '@material-ui/core';
import { Labels } from './Labels';
import { LabelConfig } from './Labels/utils/types';

type LabelsCardProps = {
  labels?: Record<string, string>;
  labelsConfig: LabelConfig[];
  title?: string;
  wrapItems?: boolean;
  friendlyItemsControlLabel?: string;
  labelKind?: 'label' | 'annotation';
};

export const LabelsCard = ({
  labels,
  labelsConfig,
  title = 'Labels',
  wrapItems = true,
  friendlyItemsControlLabel = 'Friendly labels',
  labelKind = 'label',
}: LabelsCardProps) => {
  const [displayFriendlyItems, setDisplayFriendlyItems] = useState(true);

  if (!labels) {
    return (
      <InfoCard title={title}>
        <Typography variant="body2">
          No {labelKind === 'label' ? 'labels' : 'annotations'} available.
        </Typography>
      </InfoCard>
    );
  }

  return (
    <InfoCard
      title={title}
      headerActions={
        <Switch
          label={friendlyItemsControlLabel}
          isSelected={displayFriendlyItems}
          onChange={() => {
            setDisplayFriendlyItems(!displayFriendlyItems);
          }}
        />
      }
    >
      {displayFriendlyItems && labelsConfig.length === 0 ? (
        <Typography variant="body2">
          Please configure friendly{' '}
          {labelKind === 'label' ? 'labels' : 'annotations'} to display resource{' '}
          {labelKind === 'label' ? 'labels' : 'annotations'} here.
        </Typography>
      ) : (
        <Labels
          labels={labels}
          labelsConfig={labelsConfig}
          wrapItems={wrapItems}
          displayFriendlyItems={displayFriendlyItems}
          labelKind={labelKind}
        />
      )}
    </InfoCard>
  );
};
