import { useState } from 'react';
import { InfoCard } from '@backstage/core-components';
import {
  Box,
  FormControlLabel,
  FormGroup,
  Switch,
  Typography,
} from '@material-ui/core';
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
      action={
        <Box marginTop="6px">
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={displayFriendlyItems}
                  onChange={() => {
                    setDisplayFriendlyItems(!displayFriendlyItems);
                  }}
                />
              }
              label={friendlyItemsControlLabel}
            />
          </FormGroup>
        </Box>
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
