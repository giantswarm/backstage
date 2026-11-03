import { HomePageCompanyLogo } from '@backstage/plugin-home';
import { makeStyles, useTheme } from '@material-ui/core';
import { homeLogoCandidates, useLogoAsset } from '../branding';
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
    // The wordmark is `currentColor`. On light surfaces the brand form is Giant
    // Swarm Blue; on a dark background it flips to white.
    color: theme.palette.type === 'dark' ? '#ffffff' : '#002645',
  },
  img: {
    width: 'auto',
    height: 100,
  },
}));

export const HomeLogo = () => {
  const classes = useStyles();
  const theme = useTheme();
  // Prefer a theme-specific asset; fall back to the theme-agnostic filename.
  const customAsset = useLogoAsset(homeLogoCandidates(theme.palette.type));

  if (customAsset.url) {
    return (
      <HomePageCompanyLogo
        className={classes.container}
        logo={<img className={classes.img} src={customAsset.url} alt="Logo" />}
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
