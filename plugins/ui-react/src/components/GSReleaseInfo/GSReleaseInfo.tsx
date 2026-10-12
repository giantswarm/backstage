import { Link, Text } from '@backstage/ui';
import { useShellScope } from '../ShellScope';

const REPOSITORY_URL = 'https://github.com/giantswarm/backstage';

// Only a release or RC build has a tag to link to; any other version (a
// branch build, `development` locally) is shown as it is, without a link.
const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+(-rc\.\d+)?$/;

/**
 * The portal's own release, linked to the repository and its release tag: a
 * quiet footer line at the bottom of the classic home page and of the shell's
 * Profile and settings page.
 *
 * The caller passes the version (the app's `app.releaseVersion`, declared in
 * the app's `config.d.ts`) and leaves the line out when it is unset, so this
 * library reads no config of its own.
 *
 * Both links open a new tab. Inside the shell (`ShellScopeProvider`) their
 * text ends in "↗", as the shell's other new-tab links do; classic pages keep
 * the plain line.
 */
export const GSReleaseInfo = ({ version }: { version: string }) => {
  const inShell = useShellScope();
  const newTabMarker = inShell ? ' ↗' : '';
  const bareVersion = version.replace(/^v/, '');
  const isRelease = RELEASE_VERSION_PATTERN.test(bareVersion);
  const tag = `v${bareVersion}`;

  return (
    <Text as="p" variant="body-small" color="secondary">
      This is{' '}
      <Link
        href={REPOSITORY_URL}
        target="_blank"
        rel="noopener noreferrer"
        variant="body-small"
      >
        backstage{newTabMarker}
      </Link>{' '}
      provided by Giant Swarm, release{' '}
      {isRelease ? (
        <Link
          href={`${REPOSITORY_URL}/releases/tag/${tag}`}
          target="_blank"
          rel="noopener noreferrer"
          variant="body-small"
        >
          {tag}
          {newTabMarker}
        </Link>
      ) : (
        version
      )}
    </Text>
  );
};
