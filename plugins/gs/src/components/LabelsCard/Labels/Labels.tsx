import { Box, Grid, makeStyles, Theme, Typography } from '@material-ui/core';
import { makeLabelVariants, type LabelVariant } from './utils';
import { useLabelsWithDisplayInfo } from './useLabelsWithDisplayInfo';
import {
  getDefaultLabelVariant,
  isValidLabelVariant,
} from './utils/makeLabelVariants';
import { LabelConfig } from './utils/types';
import classNames from 'classnames';

const palette = makeLabelVariants();

const useLabelStyles = makeStyles<Theme, { variant: LabelVariant }>(theme => {
  const colors = palette[theme.palette.type];

  return {
    root: {
      display: 'inline-flex',
      border: '1px solid transparent',
    },
    rootKindLabel: {
      borderColor: props => colors[props.variant].borderColor,
      borderRadius: theme.shape.borderRadius,
      overflow: 'hidden',
    },
    rootKindAnnotation: {},
    key: {
      padding: theme.spacing(1),
      '$rootKindLabel &': {
        backgroundColor: props => colors[props.variant].keyBackgroundColor,
      },
      '$rootKindAnnotation &': {
        minWidth: '250px',
        maxWidth: '250px',
        wordBreak: 'break-word',
      },
    },
    value: {
      padding: theme.spacing(1),
    },
  };
});

type LabelProps = {
  labelKey: string;
  labelValue?: string;
  labelVariant?: LabelVariant;
  labelKind?: 'label' | 'annotation';
};

const Label = ({
  labelKey,
  labelValue,
  labelVariant,
  labelKind = 'label',
}: LabelProps) => {
  const variant =
    labelVariant && isValidLabelVariant(labelVariant)
      ? labelVariant
      : getDefaultLabelVariant();

  const classes = useLabelStyles({ variant });

  return (
    <Box
      className={classNames(classes.root, {
        [classes.rootKindLabel]: labelKind === 'label',
        [classes.rootKindAnnotation]: labelKind === 'annotation',
      })}
      alignItems="baseline"
    >
      <Box className={classes.key}>
        <Typography variant="subtitle2" component="p">
          {labelKey}
        </Typography>
      </Box>
      {labelValue ? (
        <Box className={classes.value}>
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
  labelKind?: 'label' | 'annotation';
};

export const Labels = ({
  labels,
  labelsConfig,
  wrapItems = true,
  displayFriendlyItems = true,
  labelKind = 'label',
}: LabelsProps) => {
  const labelsWithDisplayInfo = useLabelsWithDisplayInfo(
    labels,
    displayFriendlyItems,
    labelsConfig,
  );

  if (displayFriendlyItems && labelsWithDisplayInfo.length === 0) {
    return (
      <Typography variant="body2">
        No {labelKind === 'label' ? 'labels' : 'annotations'} match the friendly{' '}
        {labelKind === 'label' ? 'labels' : 'annotations'} configured.
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
            labelKind={labelKind}
          />
        </Grid>
      ))}
    </Grid>
  );
};
