import { Badge, Box, Flex, Text } from '@backstage/ui';
import LocalOfferIcon from '@material-ui/icons/LocalOffer';
import { makeStyles, Theme } from '@material-ui/core';
import { Chip, IconText } from '../../../UI';
import {
  ColorVariant,
  makeColorVariants,
} from '../../../UI/colors/makeColorVariants';
import { WorkloadClusterIcon } from '../../../../assets/icons';
import { getResourceColorVariant } from '../../../../utils/getResourceColorVariant';

const palette = makeColorVariants();

// bui `Badge` is neutral-only, but the resource type must keep its per-kind
// color coding (orange Kustomization, pink HelmRelease, …). We reuse the same
// theme-aware color-variant palette as the tree-view `Chip` and override the
// badge background via an (unlayered) makeStyles rule, which beats bui's
// layered `@layer components` neutral background.
const useStyles = makeStyles<Theme, { variant: ColorVariant }>(theme => {
  const colors = palette[theme.palette.type];

  return {
    kindBadge: {
      backgroundColor: props => colors[props.variant].backgroundColor,
    },
  };
});

type ResourceChipsProps = {
  kind: string;
  namespace?: string;
  cluster: string;
  targetCluster?: string;
  emphasized?: boolean;
};

export const ResourceChips = ({
  kind,
  namespace,
  cluster,
  targetCluster,
  emphasized = false,
}: ResourceChipsProps) => {
  const colorVariant = getResourceColorVariant(kind);
  const classes = useStyles({ variant: colorVariant });
  const hasTargetCluster = Boolean(targetCluster && targetCluster !== cluster);

  if (emphasized) {
    return (
      <Flex align="center" gap="1">
        <Badge size="medium" className={classes.kindBadge}>
          {kind}
        </Badge>
        {namespace ? (
          <>
            <Text variant="body-medium" color="secondary">
              in
            </Text>
            <Badge
              size="medium"
              icon={<LocalOfferIcon style={{ fontSize: 16 }} />}
            >
              {namespace}
            </Badge>
          </>
        ) : null}
        {hasTargetCluster ? (
          <>
            <Text variant="body-medium" color="secondary">
              for
            </Text>
            <Badge
              size="medium"
              icon={<WorkloadClusterIcon style={{ fontSize: 16 }} />}
            >
              {targetCluster}
            </Badge>
          </>
        ) : null}
      </Flex>
    );
  }

  return (
    <Box>
      <Chip label={kind} variant={colorVariant} />
      {namespace ? (
        <>
          {' in '}
          <Chip
            label={<IconText icon={LocalOfferIcon}>{namespace}</IconText>}
            variant="gray"
          />
        </>
      ) : null}
      {hasTargetCluster ? (
        <>
          {' for '}
          <Chip
            label={
              <IconText icon={WorkloadClusterIcon}>{targetCluster}</IconText>
            }
            variant="gray"
          />
        </>
      ) : null}
    </Box>
  );
};
