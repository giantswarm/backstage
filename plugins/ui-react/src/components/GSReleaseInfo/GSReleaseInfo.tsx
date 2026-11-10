import { Link, Text } from '@backstage/ui';
import { CommitSha } from '../CommitSha';
import { ExternalLink } from '../ExternalLink';
import { useShellScope } from '../ShellScope';

const REPOSITORY_URL = 'https://github.com/giantswarm/backstage';

// Only a release or RC build has a tag to link to; any other version (a
// branch build, `development` locally) is shown as it is, without a link, a
// commit in it shortened like every SHA the portal shows.
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
 * Both links open a new tab. Inside the shell (`ShellScopeProvider`) they are
 * `ExternalLink`s, which say so with the launch icon and "(opens in a new
 * tab)"; classic pages keep the plain line, as the classic home page's footer
 * always had it.
 */
export const GSReleaseInfo = ({ version }: { version: string }) => {
  const inShell = useShellScope();
  const bareVersion = version.replace(/^v/, '');
  const isRelease = RELEASE_VERSION_PATTERN.test(bareVersion);
  const tag = `v${bareVersion}`;

  const newTabLink = (href: string, text: string) =>
    inShell ? (
      <ExternalLink href={href} display="inline" variant="body-small">
        {text}
      </ExternalLink>
    ) : (
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        variant="body-small"
      >
        {text}
      </Link>
    );

  return (
    <Text as="p" variant="body-small" color="secondary">
      This is {newTabLink(REPOSITORY_URL, 'backstage')} provided by Giant Swarm,
      release{' '}
      {isRelease ? (
        newTabLink(`${REPOSITORY_URL}/releases/tag/${tag}`, tag)
      ) : (
        <CommitSha value={version} />
      )}
    </Text>
  );
};
