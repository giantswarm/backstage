import {
  HomePageCompanyLogo,
  TemplateBackstageLogo,
} from '@backstage/plugin-home';
import { makeStyles, useTheme } from '@material-ui/core';
import { useBranding } from '../branding';

const useStyles = makeStyles(theme => ({
  container: {
    margin: theme.spacing(5, 0),
  },
  svg: {
    width: 'auto',
    height: 100,
  },
  img: {
    width: 'auto',
    height: 100,
  },
  path: {
    fill: '#7df3e1',
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
      logo={
        <TemplateBackstageLogo
          classes={{ svg: classes.svg, path: classes.path }}
        />
      }
    />
  );
};
