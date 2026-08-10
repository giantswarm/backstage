import { HomePageCompanyLogo } from '@backstage/plugin-home';
import { makeStyles, useTheme } from '@material-ui/core';
import { useBranding } from '../branding';
import { GiantSwarmLogoFull } from '../../assets/logo';

const useStyles = makeStyles(theme => ({
  container: {
    margin: theme.spacing(5, 0),
  },
  svg: {
    width: 'auto',
    // The lockup is ~5.3:1, so height drives a much wider footprint than the
    // square Backstage logo this replaced; cap the width on narrow viewports.
    height: 96,
    maxWidth: '100%',
    // The wordmark is `currentColor`; on the home page it sits on the app
    // background, so follow the theme's primary text color.
    color: theme.palette.text.primary,
  },
  img: {
    width: 'auto',
    height: 100,
  },
}));

export const HomeLogo = () => {
  const classes = useStyles();
  const theme = useTheme();
  const { hasAsset, getAssetUrl } = useBranding();

  // Prefer a theme-specific asset; fall back to the theme-agnostic filename.
  const variant = theme.palette.type === 'dark' ? 'dark' : 'light';
  const candidates = [
    `home-logo-${variant}.svg`,
    `home-logo-${variant}.png`,
    'home-logo.svg',
    'home-logo.png',
  ];
  const customAsset = candidates.find(name => hasAsset(name));

  if (customAsset) {
    return (
      <HomePageCompanyLogo
        className={classes.container}
        logo={
          <img
            className={classes.img}
            src={getAssetUrl(customAsset)}
            alt="Logo"
          />
        }
      />
    );
  }

  return (
    <HomePageCompanyLogo
      className={classes.container}
      logo={<GiantSwarmLogoFull className={classes.svg} />}
    />
  );
};
