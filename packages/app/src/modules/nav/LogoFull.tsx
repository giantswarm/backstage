import { makeStyles } from '@material-ui/core';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { useBranding } from '../branding';
import { GiantSwarmLogoFull } from '../../assets/logo';

const useStyles = makeStyles({
  svg: {
    width: 'auto',
    height: 26,
    // The lockup's wordmark is `currentColor`; the ant keeps its brand gradient.
    color: '#ffffff',
  },
  img: {
    width: 'auto',
    height: ({ imgHeight }: { imgHeight: number }) => imgHeight,
  },
});

export const LogoFull = () => {
  const configApi = useApi(configApiRef);
  const imgHeight =
    configApi.getOptionalNumber('app.branding.logo.height') ?? 30;
  const classes = useStyles({ imgHeight });
  const { hasAsset, getAssetUrl, isLoading } = useBranding();

  if (isLoading) {
    return null;
  }

  const customAsset =
    (hasAsset('logo-full.svg') && 'logo-full.svg') ||
    (hasAsset('logo-full.png') && 'logo-full.png') ||
    undefined;

  if (customAsset) {
    return (
      <img className={classes.img} src={getAssetUrl(customAsset)} alt="Logo" />
    );
  }

  return <GiantSwarmLogoFull className={classes.svg} />;
};
