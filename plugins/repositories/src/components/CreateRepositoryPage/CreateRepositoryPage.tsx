import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Content, Link } from '@backstage/core-components';
import { Box, Grid, Paper, Typography } from '@material-ui/core';
import { Button, Flex, Text } from '@backstage/ui';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import useDebounce from 'react-use/esm/useDebounce';
import { Problem, repositoriesApiRef } from '../../apis';
import {
  DeclarationForm,
  EMPTY,
  fixOf,
  isComplete,
  toInput,
} from '../../lib/declaration';
import { REFUSED_TITLE } from '../actions/ActionDialog';
import { ProblemFix } from '../actions/PlanView';
import { RepositoriesErrorAlert } from '../RepositoriesErrorAlert';
import { useVocabulary } from '../useManagerInfo';
import { useTeamOptions } from '../useTeamOptions';
import { rootRouteRef } from '../../routes';
import { CI_GENERATE_LABEL, DeclarationFields } from './DeclarationFields';
import { DryRunPanel } from './DryRunPanel';
import { LiveSetup } from './LiveSetup';
import { RepositoryCreated } from './RepositoryCreated';
import { useRepositoryWatch } from './useRepositoryWatch';

/** How long the form waits after the last change before it asks the manager. */
export const DRY_RUN_DEBOUNCE_MS = 600;

/**
 * Create repository: the declaration as a form -- the team (a choice, the
 * person's own first), the name (checked against the engine's rule as
 * typed), the kind, the generation fields as choices -- and, beside it, the
 * dry run as `validate_repository` renders it, kept current while the
 * person types: the entry with the schema's defaults, the template, the
 * GitHub name check, the refusals with their fix, the guard notices and the
 * creation as the person would run it. **Create** -- `create_repository` in
 * `mode: commit`: the repository and one scaffold commit as the signed-in
 * person, then the team-file pull request under their name -- and the new
 * repository followed to readiness with `watch_repository`: the phases as
 * they complete, the repository linked as ready only when every one is. The
 * form's choices are the schema's values; the manager's verdict is what
 * decides.
 */
export function CreateRepositoryPage() {
  const api = useApi(repositoriesApiRef);
  const rootLink = useRouteRef(rootRouteRef);
  const [form, setForm] = useState<DeclarationForm>(EMPTY);
  // The form as the manager last saw it: `form` settles into it once the
  // person pauses, and the dry run follows.
  const [settled, setSettled] = useState<DeclarationForm>(EMPTY);
  useDebounce(() => setSettled(form), DRY_RUN_DEBOUNCE_MS, [form]);

  // The teams the form offers, the person's own first; the one the form
  // holds is kept among them.
  const {
    own,
    teams,
    loading: teamsLoading,
    error: teamsError,
  } = useTeamOptions(form.team);
  // The form opens on the person's team; the manager decides membership.
  useEffect(() => {
    const [team] = own;
    if (team) {
      setForm(current => (current.team ? current : { ...current, team }));
    }
  }, [own]);

  // The enumerated fields' choices: the manager's report, or nothing to declare.
  const vocabulary = useVocabulary();
  const declarable = vocabulary.status === 'ready';

  const create = useMutation({
    mutationFn: () => api.createRepository(toInput(form), { mode: 'commit' }),
  });
  const created = create.data;
  // The form declares one repository; the follow is its.
  const [target] = created?.repositories ?? [];
  const watch = useRepositoryWatch({
    repository: target?.name,
    pullRequest: created?.pullRequest?.number,
  });

  const input = useMemo(() => toInput(settled), [settled]);
  const dryRun = useQuery({
    queryKey: ['repositories', 'validate', input],
    queryFn: () => api.validateRepository(input),
    enabled: declarable && isComplete(settled) && !created,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const complete = declarable && isComplete(form);
  // The manager's answer stands for the form as it is once the form has
  // settled and the answer is for it -- not the previous one kept on screen.
  const checking =
    complete &&
    !created &&
    (settled !== form || dryRun.isFetching || dryRun.isPlaceholderData);
  const validation = complete || created ? dryRun.data : undefined;
  const accepted = !!validation?.accepted && !checking && complete;
  const busy = create.isPending;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (accepted && !busy && !created) {
      create.mutate();
    }
  };

  /** A refusal's fix as a button: the value applied, the dry run follows. */
  const fixFor = (problem: Problem): ProblemFix | undefined => {
    const fix = fixOf(problem);
    if (!fix || created) {
      return undefined;
    }
    return {
      label: `Set ${CI_GENERATE_LABEL} to ${fix.ciGenerate ? 'on' : 'off'}`,
      apply: () => setForm(current => ({ ...current, ...fix })),
    };
  };

  return (
    <Content>
      <Typography variant="body2" style={{ marginBottom: 16 }}>
        <Link to={rootLink?.() ?? '/repositories'}>← Repositories</Link>
      </Typography>
      <Typography variant="h5" gutterBottom>
        Create repository
      </Typography>
      <Text variant="body-small" color="secondary">
        A new repository of the giantswarm org is created as you: the
        repository, one scaffold commit on its default branch (its first release
        follows from that push), then the declaration — an entry in the team's
        file (repositories/&lt;team&gt;.yaml in giantswarm/github) — as a pull
        request under your name. The review beside the form shows the entry and
        the plan exactly as the manager would carry them out, as you fill it in.
      </Text>

      {teamsError && (
        <Box mt={2}>
          <RepositoriesErrorAlert
            title="The repository manager could not be reached"
            error={teamsError}
          />
        </Box>
      )}

      <Box mt={3}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={7} lg={6}>
            <form onSubmit={onSubmit} aria-label="Create repository">
              <DeclarationFields
                form={form}
                onChange={setForm}
                subject={{ kind: 'new', teams, teamsLoading }}
                vocabulary={vocabulary}
                validation={validation}
                checking={checking}
                isDisabled={!!created}
              />
            </form>
          </Grid>
          <Grid item xs={12} md={5} lg={6}>
            <Paper
              variant="outlined"
              style={{ position: 'sticky', top: 16, padding: 16 }}
              data-testid="review"
            >
              <Flex direction="column" gap="3">
                <Typography variant="subtitle1" component="h2">
                  Review
                </Typography>
                {!complete && !created && (
                  <Text
                    variant="body-small"
                    color="secondary"
                    data-testid="review-hint"
                  >
                    {declarable
                      ? "Pick the team and a name: giantswarm-repo-manager renders the entry with the schema's defaults, checks the name on GitHub and plans the creation as you — here, while you type."
                      : 'Create waits for the declaration’s choices: giantswarm-repo-manager reports them, and the form offers no others.'}
                  </Text>
                )}
                {checking && (
                  <Text
                    variant="body-small"
                    color="secondary"
                    data-testid="dry-run-checking"
                  >
                    Checking with giantswarm-repo-manager…
                  </Text>
                )}
                {validation && (
                  <div style={{ opacity: checking ? 0.6 : 1 }}>
                    <DryRunPanel validation={validation} fixFor={fixFor} />
                  </div>
                )}
                {dryRun.error && !created && (
                  <RepositoriesErrorAlert
                    title="The dry run did not answer"
                    error={dryRun.error as Error}
                  />
                )}
                {create.error && (
                  <RepositoriesErrorAlert
                    title={REFUSED_TITLE}
                    error={create.error as Error}
                  />
                )}
                {created ? (
                  <RepositoryCreated
                    result={created}
                    ready={watch.data?.ready ?? false}
                  />
                ) : (
                  <div>
                    <Button
                      variant="primary"
                      isDisabled={!accepted || busy}
                      onPress={() => create.mutate()}
                    >
                      {busy ? 'Creating…' : 'Create'}
                    </Button>
                  </div>
                )}
              </Flex>
            </Paper>
          </Grid>
        </Grid>
      </Box>

      {created && target && (
        <Box mt={4} data-testid="live-setup">
          <Typography variant="subtitle1" component="h2" gutterBottom>
            Set-up of {target.name}
          </Typography>
          <LiveSetup
            repository={target.name}
            pullRequest={created.pullRequest?.number}
            watch={watch.data}
            error={watch.error}
          />
        </Box>
      )}
    </Content>
  );
}
