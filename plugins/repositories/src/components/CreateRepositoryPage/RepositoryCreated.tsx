import { Alert, Flex, Link, Text } from '@backstage/ui';
import { StatusLabel } from '@giantswarm/backstage-plugin-ui-react';
import { Created, CreatedRepository } from '../../apis';
import { PullRequestBody } from '../actions/PullRequestOpened';

/** The GitHub URL as the manager returns it, without the scheme and host. */
const slugOf = (url: string) => url.replace(/^https?:\/\/github\.com\//, '');

/**
 * One repository as `create_repository` left it: the repository -- its name
 * while the set-up runs, the link marked ready once every phase is done --
 * then its scaffold commit.
 */
function RepositoryLines({
  repository,
  firstRelease,
  ready,
}: {
  repository: CreatedRepository;
  firstRelease: string;
  ready: boolean;
}) {
  return (
    <>
      <li>
        <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
          <Text variant="body-small">
            Repository{' '}
            {ready ? (
              <Link href={repository.repository} target="_blank">
                {slugOf(repository.repository)}
              </Link>
            ) : (
              <span data-testid="repository-name">
                {slugOf(repository.repository)}
              </span>
            )}
            {repository.created
              ? ''
              : ' — existed already; the creation resumed'}
          </Text>
          {ready ? (
            <>
              {' '}
              <StatusLabel label="ready" intent="positive" />
            </>
          ) : (
            <Text variant="body-small" color="secondary">
              {' '}
              — being set up, see below
            </Text>
          )}
        </Flex>
      </li>
      {repository.scaffoldCommit && (
        <li>
          <Text variant="body-small">
            Scaffold commit{' '}
            <Link
              href={`${repository.repository}/commit/${repository.scaffoldCommit}`}
              target="_blank"
            >
              {repository.scaffoldCommit.slice(0, 7)}
            </Link>{' '}
            on its default branch — {firstRelease}
          </Text>
        </li>
      )}
    </>
  );
}

/**
 * What `create_repository` in `mode: commit` answered, in the order the
 * manager wrote as the person: the repository, its scaffold commit (the
 * first release follows from that push), then the declaration pull request
 * with what became of its ask and notice. The attribution is the manager's:
 * the author it reports is the GitHub login of the person's grant. The
 * repository is linked and marked ready only once the follow says every
 * phase is done; until then it is the name.
 */
export function RepositoryCreated({
  result,
  ready = false,
}: {
  result: Created;
  /** `watch_repository` answered `ready`. */
  ready?: boolean;
}) {
  const author = result.pullRequest?.author;
  return (
    <Alert
      status="success"
      title={`Created${author ? ` as ${author}` : ''}`}
      description={
        <Flex direction="column" gap="2" data-testid="repository-created">
          <ol style={{ margin: 0, paddingLeft: 16 }}>
            {result.repositories.map(repository => (
              <RepositoryLines
                key={repository.name}
                repository={repository}
                firstRelease={result.firstRelease}
                ready={ready}
              />
            ))}
            <li>
              {result.pullRequest ? (
                <Text variant="body-small">
                  Pull request, declaring{' '}
                  {result.repositories.map(r => r.name).join(', ')} in the
                  team's file
                </Text>
              ) : (
                <Text variant="body-small">
                  No pull request: the manager accepted the request without
                  opening one.
                </Text>
              )}
            </li>
          </ol>
          <PullRequestBody result={result} />
        </Flex>
      }
    />
  );
}
