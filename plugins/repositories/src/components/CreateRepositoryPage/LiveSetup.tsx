import { Alert, Flex, Link, Text } from '@backstage/ui';
import { Watch } from '../../apis';
import { failureTitle, watchPhases } from '../../lib/phases';
import { FindingsList } from '../FindingsList';
import { PhaseList } from '../PhaseList';
import { RepositoriesErrorAlert } from '../RepositoriesErrorAlert';
import { RepositoryDetails } from '../RepositoryDetails';

/**
 * The set-up of a repository just created, followed live through
 * `watch_repository`: the phases as they complete -- created, scaffolded,
 * declared, merged, set up, released -- with their time since the creation,
 * the reason the manager gives while a phase waits, a failure with the
 * manager's reason (a red first release names the job), the reconciler run's
 * findings once it has reported, and, from then on, the record with its
 * set-up steps -- the same view the row shows. A call that did not answer
 * shows its error under the phases and is tried again; nothing here waits
 * on a record that does not exist yet.
 */
export function LiveSetup({
  repository,
  pullRequest,
  watch,
  error,
}: {
  repository: string;
  /** The declaration pull request's number; without one there is nothing to follow. */
  pullRequest?: number;
  /** The last answer of `watch_repository`. */
  watch?: Watch;
  /** The last call's error, while the last answer (if any) stays. */
  error?: Error | null;
}) {
  if (pullRequest === undefined) {
    return (
      <Text variant="body-small" color="secondary" data-testid="setup-waiting">
        The manager opened no pull request, so there is no set-up to follow: the
        reconciler sets a repository up from its merged declaration.
      </Text>
    );
  }
  if (!watch) {
    return (
      <Flex direction="column" gap="2">
        <Text
          variant="body-small"
          color="secondary"
          data-testid="setup-waiting"
        >
          Following {repository} with giantswarm-repo-manager: the phases appear
          here as they complete.
        </Text>
        {error && (
          <RepositoriesErrorAlert
            title="The follow did not answer; trying again"
            error={error}
          />
        )}
      </Flex>
    );
  }
  const phases = watchPhases(watch);
  const setUp = watch.phases.some(phase => phase.name === 'setUp');
  return (
    <Flex direction="column" gap="4">
      <PhaseList phases={phases} data-testid="phases" />
      {watch.failure && (
        <div data-testid="setup-failure">
          <Alert
            status="danger"
            title={failureTitle(watch.failure.phase)}
            description={watch.failure.reason}
          />
        </div>
      )}
      {watch.ready && (
        <div data-testid="setup-ready">
          <Alert
            status="success"
            title={`${repository} is ready`}
            description={
              <Text variant="body-small">
                Every phase is done
                {watch.release && (
                  <>
                    : the first release{' '}
                    <Link
                      href={watch.release.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {watch.release.tag}
                    </Link>{' '}
                    built green
                  </>
                )}
                .
              </Text>
            }
          />
        </div>
      )}
      {error && !watch.ready && !watch.failure && (
        <RepositoriesErrorAlert
          title="The follow did not answer; trying again"
          error={error}
        />
      )}
      {watch.findings && watch.findings.length > 0 && (
        <Flex direction="column" gap="2">
          <Text variant="body-small" color="secondary">
            The reconciler run left{' '}
            {watch.findings.length === 1 ? 'a finding' : 'findings'} for you:
          </Text>
          <FindingsList
            findings={watch.findings}
            data-testid="watch-findings"
          />
        </Flex>
      )}
      {setUp && <RepositoryDetails repository={repository} />}
    </Flex>
  );
}
