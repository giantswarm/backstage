import { Box, makeStyles } from '@material-ui/core';
import LocalOfferIcon from '@material-ui/icons/LocalOffer';
import { Chip, IconText } from '../../../UI';
import { WorkloadClusterIcon } from '../../../../assets/icons';
import { getResourceColorVariant } from '../../../../utils/getResourceColorVariant';

const useStyles = makeStyles(() => ({
  chips: {
    margin: '-2px 0',
  },
  chip: {
    margin: '2px 0',
  },
}));

type ResourceChipsProps = {
  kind: string;
  namespace?: string;
  cluster: string;
  targetCluster?: string;
};

export const ResourceChips = ({
  kind,
  namespace,
  cluster,
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
      {targetCluster && targetCluster !== cluster ? (
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
