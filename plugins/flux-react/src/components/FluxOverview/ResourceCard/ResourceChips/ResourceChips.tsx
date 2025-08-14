import { Box, makeStyles } from '@material-ui/core';
import LocalOfferIcon from '@material-ui/icons/LocalOffer';
import { ColorVariant } from '../../../UI/colors/makeColorVariants';
import { Chip, IconText } from '../../../UI';
import { WorkloadClusterIcon } from '../../../../assets/icons';

const useStyles = makeStyles(() => ({
  chips: {
    margin: '-2px 0',
  },
  chip: {
    margin: '2px 0',
  },
}));

function getResourceColorVariant(kind: string) {
  let variant: ColorVariant;
  switch (kind) {
    case 'GitRepository':
      variant = 'purple';
      break;
    case 'HelmRelease':
      variant = 'pink';
      break;
    case 'HelmRepository':
      variant = 'blue';
      break;
    case 'Kustomization':
      variant = 'orange';
      break;

    default:
      variant = 'gray';
      break;
  }

  return variant;
}

type ResourceChipsProps = {
  kind: string;
  namespace?: string;
  targetCluster?: string;
};

export const ResourceChips = ({
  kind,
  namespace,
  targetCluster,
}: ResourceChipsProps) => {
  const classes = useStyles();

  const colorVariant = getResourceColorVariant(kind);

  return (
    <Box className={classes.chips}>
      <Chip label={kind} variant={colorVariant} className={classes.chip} />
      {namespace ? (
        <>
          {' in '}
          <Chip
            label={<IconText icon={LocalOfferIcon}>{namespace}</IconText>}
            variant="gray"
            className={classes.chip}
          />
        </>
      ) : null}
      {targetCluster ? (
        <>
          {' for '}
          <Chip
            label={
              <IconText icon={WorkloadClusterIcon}>{targetCluster}</IconText>
            }
            variant="gray"
            className={classes.chip}
          />
        </>
      ) : null}
    </Box>
  );
};
