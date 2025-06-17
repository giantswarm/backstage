import { useState } from 'react';
import { InfoCard } from '@backstage/core-components';
import { Box, FormControlLabel, FormGroup, Switch } from '@material-ui/core';
import { Labels } from './Labels';
import { LabelConfig } from './Labels/utils/types';

type LabelsCardProps = {
  labels: Record<string, string>;
  labelsConfig: LabelConfig[];
  title?: string;
  wrapItems?: boolean;
  friendlyItemsControlLabel?: string;
};

export const LabelsCard = ({
  labels,
  labelsConfig,
  title = 'Labels',
  wrapItems = true,
  friendlyItemsControlLabel = 'Friendly labels',
}: LabelsCardProps) => {
  const [displayFriendlyItems, setDisplayFriendlyItems] = useState(true);

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
      <Labels
        labels={labels}
        labelsConfig={labelsConfig}
        wrapItems={wrapItems}
        displayFriendlyItems={displayFriendlyItems}
      />
    </InfoCard>
  );
};
