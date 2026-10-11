import { useLayoutEffect } from 'react';
import { Progress } from '@backstage/core-components';
import type { IdentityApi } from '@backstage/core-plugin-api';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { LogoIcon } from '../../nav/LogoIcon';
import { useAgentShellArea } from '../agentArea';
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--bui-space-2)',
  },
  fullWidth: {
    width: '100%',
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
    document.documentElement.dataset.agentShell = '';
    return () => {
      delete document.documentElement.dataset.agentShell;
    };
  }, [ownedByThemeRoot]);
}

export interface ShellSignInPageProps {
  onSignInSuccess(identityApi: IdentityApi): void;
  providers: ShellSignInProvider[];
}

/**
 * The sign-in window of a deployment that serves the Agent Platform
 * (`app.portals.agentPlatform`): one centered card in the shell's look — the
 * rail's logo beside the name, as one title, then a button per sign-in option
 * with its message
 * beneath. The first option is the primary action. Behaves like upstream's
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
          <Flex direction="column" align="center" gap="1">
            {/* The mark joins the title, beside it as in the rail, so the
                card reads as the Giant Swarm Agent Platform (T71): the ant's
                label is "Giant Swarm", which makes the heading's name too.
                Beside, not above — the brand allows the horizontal form only.
                The space keeps the two words apart in that name; the flex row
                does not draw it. */}
            <h1 id="shell-sign-in-title" className={classes.title}>
              <LogoIcon />{' '}
              <Text as="span" variant="title-small">
                Agent Platform
              </Text>
            </h1>
            <Text variant="body-medium" color="secondary">
              Sign in to continue.
            </Text>
          </Flex>
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
                  aria-describedby={`shell-sign-in-${provider.id}`}
                  loading={pendingId === provider.id}
                  isDisabled={pendingId !== undefined}
                  onPress={() => signIn(provider)}
                >
                  {`Sign in with ${provider.title}`}
                </Button>
                <Text
                  id={`shell-sign-in-${provider.id}`}
                  variant="body-small"
                  color="secondary"
                >
                  {provider.message}
                </Text>
              </Flex>
            ))}
          </Flex>
        </Flex>
      </section>
    </main>
  );
}
