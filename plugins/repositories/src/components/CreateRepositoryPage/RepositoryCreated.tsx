import { Alert, Flex, Link, Text } from '@backstage/ui';
import { Created, CreatedRepository } from '../../apis';
import { PullRequestBody } from '../actions/PullRequestOpened';

/** The GitHub URL as the manager returns it, without the scheme and host. */
const slugOf = (url: string) => url.replace(/^https?:\/\/github\.com\//, '');

/** One repository as `create_repository` left it: the repository, then its scaffold commit. */
function RepositoryLines({
  repository,
  firstRelease,
}: {
  repository: CreatedRepository;
  firstRelease: string;
}) {
  return (
    <>
      <li>
        <Text variant="body-small">
          Repository{' '}
          <Link href={repository.repository} target="_blank">
            {slugOf(repository.repository)}
          </Link>
          {repository.created ? '' : ' — existed already; the creation resumed'}
        </Text>
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
 * the author it reports is the GitHub login of the person's grant.
 */
export function RepositoryCreated({ result }: { result: Created }) {
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
