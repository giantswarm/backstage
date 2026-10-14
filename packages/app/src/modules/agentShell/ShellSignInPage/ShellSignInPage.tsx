import { useLayoutEffect } from 'react';
import { Progress } from '@backstage/core-components';
import type { IdentityApi } from '@backstage/core-plugin-api';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import { GiantSwarmLogoFull } from '../../../assets/logo';
import { useBranding } from '../../branding';
import { useAgentShellArea } from '../agentArea';
import { setAgentShellMark } from '../AgentShellThemeRoot/useAgentShellAttribute';
import { agentShellLightColors } from '../theme';
import {
  type ShellSignInProvider,
  useProviderSignIn,
} from './useProviderSignIn';

const useStyles = makeStyles({
  page: {
    // The dynamic viewport: iOS Safari's 100vh is the view with its toolbars
    // hidden, so the card page scrolled a little for nothing (T22 P5). JSS
    // puts the fallback first, for browsers without dvh.
    minHeight: '100dvh',
    fallbacks: {
      minHeight: '100vh',
    },
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--bui-space-4)',
    background: 'var(--agent-shell-rail-bg, var(--bui-bg-neutral-2))',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    boxSizing: 'border-box',
    padding: 'var(--bui-space-8) var(--bui-space-6)',
    background: 'var(--bui-bg-app)',
    border: '1px solid var(--bui-border-1)',
    borderRadius: 12,
    boxShadow: agentShellLightColors.composerShadow,
  },
  title: {
    margin: 0,
    display: 'flex',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
});

const useLogoStyles = makeStyles({
  logo: {
    // The lockup is ~5.3:1: 40px high is ~210px wide, which fits the card
    // down to a 320px phone. Never stretched, so only the height is set.
    display: 'block',
    width: 'auto',
    height: 40,
    maxWidth: '100%',
  },
  logoSvg: {
    // The wordmark is `currentColor`, the ant keeps its brand colors. On a
    // light surface the wordmark is Giant Swarm Blue, on a dark one white.
    color: ({ dark }: { dark: boolean }) => (dark ? '#ffffff' : '#002645'),
  },
});

/**
 * Keeps the document marked as the agent shell (`data-agent-shell`) while the
 * sign-in page shows, so the page renders in the shell's light palette, font
 * and bui tokens (agent-shell.css, the theme providers) whatever the URL. On
 * the agent area's own routes `AgentShellThemeRoot` already owns the mark and
 * this leaves it alone; elsewhere (a deep link to a classic page) it sets the
 * mark for as long as the page is up, and the classic page that follows
 * sign-in gets its classic look back.
 */
function useShellDocumentMark() {
  const ownedByThemeRoot = useAgentShellArea();
  useLayoutEffect(() => {
    if (ownedByThemeRoot) {
      return undefined;
    }
    import('../fonts').catch(() => {});
    setAgentShellMark(true);
    return () => setAgentShellMark(false);
  }, [ownedByThemeRoot]);
}

/**
 * The logo the sign-in card leads with: the full Giant Swarm lockup, or the
 * deployment's own home page logo (`home-logo-light|dark.*`, `home-logo.*`;
 * see docs/branding.md) — the card is a content surface, like the home page,
 * not the sidebar. The shell is light-only today, but both follow the theme
 * like `HomeLogo`, so a dark shell gets the white wordmark.
 */
function SignInLogo() {
  const theme = useTheme();
  const dark = theme.palette.type === 'dark';
  const classes = useLogoStyles({ dark });
  const { hasAsset, getAssetUrl, isLoading } = useBranding();

  // Nothing until the manifest is in, so a branded deployment never shows
  // the Giant Swarm logo first.
  if (isLoading) {
    return null;
  }

  const variant = dark ? 'dark' : 'light';
  const customAsset = [
    `home-logo-${variant}.svg`,
    `home-logo-${variant}.png`,
    'home-logo.svg',
    'home-logo.png',
  ].find(name => hasAsset(name));

  if (customAsset) {
    return (
      <img className={classes.logo} src={getAssetUrl(customAsset)} alt="Logo" />
    );
  }

  return (
    <GiantSwarmLogoFull className={`${classes.logo} ${classes.logoSvg}`} />
  );
}

export interface ShellSignInPageProps {
  onSignInSuccess(identityApi: IdentityApi): void;
  providers: ShellSignInProvider[];
}

/**
 * The sign-in window of a deployment that serves the Agent Platform
 * (`app.portals.agentPlatform`): one centered card in the shell's look — the
 * full Giant Swarm logo as the title, then a button per sign-in option with
 * its message, if it has one, beneath. The first option is the primary
 * action. Behaves like upstream's
 * `SignInPage` (see {@link useProviderSignIn}); classic-only deployments keep
 * that page unchanged.
 */
export function ShellSignInPage({
  onSignInSuccess,
  providers,
}: ShellSignInPageProps) {
  const classes = useStyles();
  useShellDocumentMark();
  const { loading, pendingId, error, signIn } = useProviderSignIn(
    providers,
    onSignInSuccess,
  );

  if (loading) {
    return <Progress />;
  }

  return (
    <main className={classes.page}>
      <section className={classes.card} aria-labelledby="shell-sign-in-title">
        <Flex direction="column" gap="6">
          {/* The full logo is the title: its label, "Giant Swarm", is the
              heading's name and the card's. The lockup carries the wordmark,
              so no text sits beside it. */}
          <h1 id="shell-sign-in-title" className={classes.title}>
            <SignInLogo />
          </h1>
          {error && error.name !== 'PopupRejectedError' && (
            <Alert
              status="danger"
              icon
              title="Sign-in did not complete"
              description={error.message}
            />
          )}
          {error?.name === 'PopupRejectedError' && (
            <Alert
              status="warning"
              icon
              title="The sign-in window was blocked"
              description="Allow pop-ups for this site, then try again."
            />
          )}
          <Flex direction="column" gap="4">
            {providers.map((provider, index) => (
              <Flex key={provider.id} direction="column" align="center" gap="1">
                <Button
                  className={classes.fullWidth}
                  variant={index === 0 ? 'primary' : 'secondary'}
                  aria-describedby={
                    provider.message
                      ? `shell-sign-in-${provider.id}`
                      : undefined
                  }
                  loading={pendingId === provider.id}
                  isDisabled={pendingId !== undefined}
                  onPress={() => signIn(provider)}
                >
                  {`Sign in with ${provider.title}`}
                </Button>
                {provider.message && (
                  <Text
                    id={`shell-sign-in-${provider.id}`}
                    variant="body-small"
                    color="secondary"
                  >
                    {provider.message}
                  </Text>
                )}
              </Flex>
            ))}
          </Flex>
        </Flex>
      </section>
    </main>
  );
}
