import { Box, Grid, makeStyles, Theme, Typography } from '@material-ui/core';
import { makeLabelVariants, type LabelVariant } from './utils';
import { useLabelsWithDisplayInfo } from './useLabelsWithDisplayInfo';
import {
  getDefaultLabelVariant,
  isValidLabelVariant,
} from './utils/makeLabelVariants';
import { LabelConfig } from './utils/types';

const palette = makeLabelVariants();

const useStyles = makeStyles<Theme, { variant: LabelVariant }>(theme => {
  const currentPalette = palette[theme.palette.type];

  return {
    label: {
      display: 'inline-flex',
      borderRadius: theme.shape.borderRadius,
      border: props => `1px solid ${currentPalette[props.variant].borderColor}`,
      overflow: 'hidden',
    },
    labelKey: {
      backgroundColor: props =>
        currentPalette[props.variant].keyBackgroundColor,
      padding: theme.spacing(1),
    },
    labelValue: {
      padding: theme.spacing(1),
    },
  };
});

type LabelProps = {
  labelKey: string;
  labelValue?: string;
  labelVariant?: LabelVariant;
};

const Label = ({ labelKey, labelValue, labelVariant }: LabelProps) => {
  const variant =
    labelVariant && isValidLabelVariant(labelVariant)
      ? labelVariant
      : getDefaultLabelVariant();

  const classes = useStyles({ variant });

  return (
    <Box className={classes.label} alignItems="baseline">
      <Box className={classes.labelKey}>
        <Typography variant="subtitle2" component="p">
          {labelKey}
        </Typography>
      </Box>
      {labelValue ? (
        <Box className={classes.labelValue}>
          <Typography variant="body2">{labelValue}</Typography>
        </Box>
      ) : null}
    </Box>
  );
};

type LabelsProps = {
  labels: Record<string, string>;
  labelsConfig: LabelConfig[];
  wrapItems?: boolean;
  displayFriendlyItems?: boolean;
};

export const Labels = ({
  labels,
  labelsConfig,
  wrapItems = true,
  displayFriendlyItems = true,
}: LabelsProps) => {
  const labelsWithDisplayInfo = useLabelsWithDisplayInfo(
    labels,
    displayFriendlyItems,
    labelsConfig,
  );

  if (labelsWithDisplayInfo.length === 0) {
    return (
      <Typography variant="body2">
        No items match provided configuration.
      </Typography>
    );
  }

  return (
    <Grid container spacing={1}>
      {labelsWithDisplayInfo.map(label => (
        <Grid item key={label.key} xs={wrapItems ? undefined : 12}>
          <Label
            labelKey={displayFriendlyItems ? label.formattedKey : label.key}
            labelValue={
              displayFriendlyItems ? label.formattedValue : label.value
            }
            labelVariant={label.variant}
          />
        </Grid>
      ))}
    </Grid>
  );
};
