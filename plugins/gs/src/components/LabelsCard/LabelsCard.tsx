import { useState } from 'react';
import { InfoCard } from '@backstage/core-components';
import { Box, FormControlLabel, FormGroup, Switch } from '@material-ui/core';
import { Labels } from './Labels';

type LabelsCardProps = {
  labels: Record<string, string>;
};

export const LabelsCard = ({ labels }: LabelsCardProps) => {
  const [displayRawLabels, setDisplayRawLabels] = useState(false);

  return (
    <InfoCard
      title="Labels"
      action={
        <Box marginTop="6px">
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={displayRawLabels}
                  onChange={() => {
                    setDisplayRawLabels(!displayRawLabels);
                  }}
                />
              }
              label="Display raw labels"
            />
          </FormGroup>
        </Box>
      }
    >
      <Labels labels={labels} displayRawLabels={displayRawLabels} />
    </InfoCard>
  );
};
