import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { Link, Text } from '@backstage/ui';

const REPOSITORY_URL = 'https://github.com/giantswarm/backstage';

// Only a release or RC build has a tag to link to; any other version (a
// branch build, `development` locally) is shown as it is, without a link.
const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+(-rc\.\d+)?$/;

export const ReleaseInfo = () => {
  const configApi = useApi(configApiRef);
  const releaseVersion = configApi.getOptionalString('app.releaseVersion');
  if (!releaseVersion) {
    return null;
  }

  const version = releaseVersion.replace(/^v/, '');
  const isRelease = RELEASE_VERSION_PATTERN.test(version);
  const tag = `v${version}`;

  return (
    <Text as="p" variant="body-small" color="secondary">
      This is{' '}
      <Link
        href={REPOSITORY_URL}
        target="_blank"
        rel="noopener noreferrer"
        variant="body-small"
      >
        backstage
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
        </Link>
      ) : (
        releaseVersion
      )}
    </Text>
  );
};
