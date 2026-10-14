import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import {
  GIANT_SWARM_WORDMARK_COLOR,
  GiantSwarmLogoFull,
} from '../../../../assets/logo';
import { homeLogoCandidates, useLogoAsset } from '../../../branding';

/**
 * The logo's height. The lockup is ~5.3:1, so 40px high is ~212px wide, which
 * fits the card down to a 320px phone.
 */
export const SIGN_IN_LOGO_HEIGHT = 40;

/** The expanded sidebar's logo, sized by `app.branding.logo.height`. */
const SIDEBAR_LOGO_ASSETS = ['logo-full.svg', 'logo-full.png'];

const useStyles = makeStyles({
  logo: {
    display: 'block',
    width: 'auto',
    height: SIGN_IN_LOGO_HEIGHT,
    maxWidth: '100%',
  },
  svg: {
    // The brand file's colors, in every theme: the lockup's wordmark is
    // `currentColor`, so it takes the brand's color from here; the ant
    // carries its own.
    color: GIANT_SWARM_WORDMARK_COLOR,
  },
  img: {
    // Never stretched: where the card is narrower than a wide logo, the image
    // scales down inside its box instead of losing its proportions.
    objectFit: 'contain',
  },
});

/**
 * The logo the sign-in card leads with. A branded deployment shows its own:
 * the home page logo first (`home-logo-light|dark.*`, `home-logo.*`), as the
 * card is a content surface like the home page, else the expanded sidebar's
 * (`logo-full.*`). Otherwise the full Giant Swarm lockup in the brand file's
 * colors, labelled "Giant Swarm"; a custom logo is named after the portal (`app.title`). Either name
 * is the title's. Renders nothing until the branding manifest is in, so a
 * branded deployment never shows the Giant Swarm logo first.
 */
export function SignInLogo() {
  const classes = useStyles();
  const theme = useTheme();
  const configApi = useApi(configApiRef);
  const customAsset = useLogoAsset([
    ...homeLogoCandidates(theme.palette.type),
    ...SIDEBAR_LOGO_ASSETS,
  ]);

  if (customAsset.isLoading) {
    return null;
  }

  if (customAsset.url) {
    const sidebarLogo = SIDEBAR_LOGO_ASSETS.includes(customAsset.name!);
    return (
      <img
        className={`${classes.logo} ${classes.img}`}
        style={
          sidebarLogo
            ? {
                height:
                  configApi.getOptionalNumber('app.branding.logo.height') ??
                  SIGN_IN_LOGO_HEIGHT,
              }
            : undefined
        }
        src={customAsset.url}
        alt={configApi.getOptionalString('app.title') ?? 'Logo'}
      />
    );
  }

  return <GiantSwarmLogoFull className={`${classes.logo} ${classes.svg}`} />;
}
