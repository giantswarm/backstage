import { makeStyles } from '@material-ui/core';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { useBranding } from '../branding';
import { GiantSwarmMark } from '../../assets/logo';

const useStyles = makeStyles({
  svg: {
    // The mark carries its own brand colors, so it needs no `color` here.
    width: 'auto',
    height: 26,
  },
  img: {
    width: 'auto',
    height: ({ imgHeight }: { imgHeight: number }) => imgHeight,
  },
});

export const LogoIcon = () => {
  const configApi = useApi(configApiRef);
  const imgHeight =
    configApi.getOptionalNumber('app.branding.logo.height') ?? 30;
  const classes = useStyles({ imgHeight });
  const { hasAsset, getAssetUrl, isLoading } = useBranding();

  if (isLoading) {
    return null;
  }

  const customAsset =
    (hasAsset('logo-icon.svg') && 'logo-icon.svg') ||
    (hasAsset('logo-icon.png') && 'logo-icon.png') ||
    undefined;

  if (customAsset) {
    return (
      <img className={classes.img} src={getAssetUrl(customAsset)} alt="Logo" />
    );
  }

  return <GiantSwarmMark className={classes.svg} />;
};
