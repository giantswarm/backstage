import { Box, makeStyles, Typography } from '@material-ui/core';
import LocalOfferIcon from '@material-ui/icons/LocalOffer';
import { ColorVariant } from '../../../UI/colors/makeColorVariants';
import { Chip, IconText } from '../../../UI';
import { WorkloadClusterIcon } from '../../../../assets/icons';
import classNames from 'classnames';

const useStyles = makeStyles(theme => ({
  heading: {
    marginBottom: theme.spacing(1),
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    width: '100%',
  },
  headingSuspended: {
    color: theme.palette.type === 'light' ? '#444' : '#909090',
  },
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

type ResourceInfoProps = {
  kind: string;
  name: string;
  namespace?: string;
  cluster: string;
  targetCluster?: string;
  isSuspended?: boolean;
};

export const ResourceInfo = ({
  kind,
  name,
  namespace,
  targetCluster,
  isSuspended,
}: ResourceInfoProps) => {
  const classes = useStyles();

  const colorVariant = getResourceColorVariant(kind);

  return (
    <Box display="flex" flexDirection="column" width="100%">
      <Typography
        variant="h6"
        className={classNames(classes.heading, {
          [classes.headingSuspended]: isSuspended,
        })}
      >
        {name}
      </Typography>

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
    </Box>
  );
};
