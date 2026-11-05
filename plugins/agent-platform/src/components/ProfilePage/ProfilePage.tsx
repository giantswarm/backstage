import { useEffect, useState } from 'react';
import {
  configApiRef,
  identityApiRef,
  ProfileInfo,
  useApi,
} from '@backstage/frontend-plugin-api';
import { Avatar, Button, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import ExitToAppIcon from '@material-ui/icons/ExitToApp';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';
import { ProviderAppConnections } from '@giantswarm/backstage-plugin-muster';
import {
  PageHeaderActionsProvider,
  GSReleaseInfo,
  LoadingIndicator,
  SectionHeader,
  ShellPage,
  ShowMore,
} from '@giantswarm/backstage-plugin-ui-react';
import { InstallationChip } from '../InstallationChip';

/** How many environment badges show before *Show all N environments*. */
const INITIAL_BADGES = 20;

const useStyles = makeStyles(theme => ({
  section: {
    padding: theme.spacing(3, 0),
    borderBottom: '1px solid var(--bui-border-1)',
    '&:first-child': {
      paddingTop: 0,
    },
  },
}));

/**
 * The signed-in identity, the same way the shell rail's `useProfile` reads it.
 * `undefined` until the identity API answers; a failure stays `undefined`, and
 * the card then falls back to naming the session without details.
 */
function useProfileInfo(): ProfileInfo | undefined {
  const identityApi = useApi(identityApiRef);
  const [profile, setProfile] = useState<ProfileInfo>();
  useEffect(() => {
    let cancelled = false;
    identityApi
      .getProfileInfo()
      .then(info => {
        if (!cancelled) {
          setProfile(info);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [identityApi]);
  return profile;
}

/**
 * The shell's minimal "Profile and settings" page
 * (`/profile`): who is signed in, the installations this
 * portal talks to, and Sign out — so the rail's profile menu stays in the
 * shell instead of jumping into the classic Settings chrome. The page's
 * footer names the running release (`app.releaseVersion`), the same line as
 * the classic home page's, where a settings page usually keeps it.
 *
 * Deliberately minimal, carrying only what has data behind it. Everything
 * else (feature flags, auth providers, the classic settings tabs) stays in
 * the Platform Portal, reachable through the explicit escape hatch at the
 * bottom — a new tab, per the shell's cross-link convention, so nothing
 * silently swaps chrome mid-session.
 */
export function ProfilePage() {
  const classes = useStyles();
  const identityApi = useApi(identityApiRef);
  const releaseVersion =
    useApi(configApiRef).getOptionalString('app.releaseVersion');
  const profile = useProfileInfo();
  const { installations, isLoading: installationsLoading } = useInstallations();

  const displayName = profile?.displayName?.trim() || undefined;
  const email = profile?.email?.trim() || undefined;
  const name = displayName ?? email ?? '';

  return (
    <PageHeaderActionsProvider>
      <ShellPage
        title="Profile and settings"
        // No version, no footer: the slot then renders nothing at all.
        footer={
          releaseVersion ? (
            <GSReleaseInfo version={releaseVersion} />
          ) : undefined
        }
      >
        <section aria-label="Profile" className={classes.section}>
          <Flex align="center" gap="4">
            <Avatar
              src={profile?.picture ?? ''}
              name={name || 'Signed-in user'}
              size="large"
              purpose="decoration"
            />
            {/* Shrinks beside the avatar and breaks a long address anywhere,
                rather than pushing the row past a phone's 343px (T22 C6). */}
            <Flex
              direction="column"
              gap="1"
              style={{ minWidth: 0, overflowWrap: 'anywhere' }}
              data-testid="profile-identity"
            >
              <Text as="div" variant="title-x-small" weight="bold">
                {name || 'Signed in'}
              </Text>
              <Text as="div" variant="body-medium" color="secondary">
                {displayName && email ? `${email} · ` : ''}from your company
                login
              </Text>
            </Flex>
          </Flex>
        </section>
        {(installationsLoading || installations.length > 0) && (
          <section aria-label="Environments" className={classes.section}>
            <SectionHeader
              variant="title-x-small"
              title="Environments"
              description="These are the environments this portal talks to."
            />
            {installationsLoading ? (
              <LoadingIndicator label="Reading the environments…" />
            ) : (
              // A fleet of 50 is a wall of badges: the first 20, then one
              // click for the rest.
              <ShowMore
                items={installations}
                initial={INITIAL_BADGES}
                noun="environment"
                revealAll
              >
                {visible => (
                  <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
                    {visible.map(installation => (
                      <InstallationChip
                        key={installation.name}
                        installation={installation.name}
                      />
                    ))}
                  </Flex>
                )}
              </ShowMore>
            )}
          </section>
        )}
        {/* The person's home installation, whose muster keeps them. */}
        <ProviderAppConnections>
          {list => (
            <section aria-label="Connections" className={classes.section}>
              <SectionHeader
                variant="title-x-small"
                title="Connections"
                description="Accounts of your own that your agents use, such as your ChatGPT subscription."
              />
              {list}
            </section>
          )}
        </ProviderAppConnections>
        <section aria-label="Session" className={classes.section}>
          <Button
            variant="secondary"
            iconStart={<ExitToAppIcon fontSize="small" />}
            onPress={() => {
              void identityApi.signOut();
            }}
          >
            Sign out
          </Button>
        </section>
        <Flex direction="column" gap="1" pt="4">
          <Text variant="body-small" color="secondary">
            Everything else — feature flags, appearance, the classic settings —
            lives in the Platform Portal.
          </Text>
          {/* The one link that leaves the shell: a new tab, like the rail's
              Platform Portal item, so the shell stays where it is. */}
          <Link
            href="/settings"
            target="_blank"
            rel="noopener noreferrer"
            variant="body-small"
          >
            All portal settings ↗
          </Link>
        </Flex>
      </ShellPage>
    </PageHeaderActionsProvider>
  );
}
