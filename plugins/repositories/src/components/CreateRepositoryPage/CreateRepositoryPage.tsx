import { FormEvent, useEffect, useState } from 'react';
import { Content, Link } from '@backstage/core-components';
import { Box, Typography } from '@material-ui/core';
import { Button, Flex, Text, TextAreaField, TextField } from '@backstage/ui';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DeclarationEntry, repositoriesApiRef, Validation } from '../../apis';
import { teamsOf } from '../../lib/scope';
import { REFUSED_TITLE } from '../actions/ActionDialog';
import { PullRequestOpened } from '../actions/PullRequestOpened';
import { RepositoriesErrorAlert } from '../RepositoriesErrorAlert';
import { rootRouteRef } from '../../routes';
import { DryRunPanel } from './DryRunPanel';
import { LiveSetup } from './LiveSetup';

/** The form: the declaration's fields as the manager's tools name them. */
export interface DeclarationForm {
  team: string;
  name: string;
  componentType: string;
  language: string;
  /** Comma-separated. */
  flavours: string;
  description: string;
  visibility: string;
  reason: string;
}

const EMPTY: DeclarationForm = {
  team: '',
  name: '',
  componentType: '',
  language: '',
  flavours: '',
  description: '',
  visibility: '',
  reason: '',
};

/**
 * The entry the form describes, as it goes into the team file: `name`,
 * `componentType`, `gen: {language, flavours}`, `description`, `visibility`.
 * Empty fields are left out so the schema's defaults apply; every value is
 * handed on as typed -- the manager's dry run says what it makes of it.
 */
export function toEntry(form: DeclarationForm): DeclarationEntry {
  const gen: Record<string, unknown> = {};
  if (form.language.trim()) {
    gen.language = form.language.trim();
  }
  const flavours = form.flavours
    .split(',')
    .map(flavour => flavour.trim())
    .filter(Boolean);
  if (flavours.length > 0) {
    gen.flavours = flavours;
  }
  return {
    name: form.name.trim(),
    ...(form.componentType.trim() && {
      componentType: form.componentType.trim(),
    }),
    ...(Object.keys(gen).length > 0 && { gen }),
    ...(form.description.trim() && { description: form.description.trim() }),
    ...(form.visibility.trim() && { visibility: form.visibility.trim() }),
  };
}

/** Whether a refusal names this form field (`gen.flavours[1]` → flavours). */
function refused(validation: Validation | undefined, field: string): boolean {
  return !!validation?.entries.some(entry =>
    entry.problems?.some(problem => {
      const path = problem.field.replace(/^gen\./, '').replace(/\[\d+\]$/, '');
      return path === field;
    }),
  );
}

/**
 * Create repository: the declaration form, its dry run as
 * `validate_repository` renders it (the entry with defaults, the template,
 * the name check, the refusals and the guard notices), then **Create** --
 * `create_repository` in `mode: commit`, the team-file pull request opened
 * as the signed-in person -- and the set-up steps of the new repository
 * completing live once the reconciler has it. The page holds no schema of
 * its own: every field is handed on as typed and the manager's verdict is
 * what shows.
 */
export function CreateRepositoryPage() {
  const api = useApi(repositoriesApiRef);
  const rootLink = useRouteRef(rootRouteRef);
  const [form, setForm] = useState<DeclarationForm>(EMPTY);
  const [validation, setValidation] = useState<Validation>();

  const info = useQuery({
    queryKey: ['repositories', 'info'],
    queryFn: () => api.getInfo(),
  });
  // The form opens on the person's team; the manager decides membership.
  useEffect(() => {
    const [team] = teamsOf(info.data);
    if (team) {
      setForm(current => (current.team ? current : { ...current, team }));
    }
  }, [info.data]);

  const input = () => ({
    team: form.team.trim(),
    entry: toEntry(form),
    reason: form.reason.trim() || undefined,
  });
  const review = useMutation({
    mutationFn: () => api.validateRepository(input()),
    onSuccess: setValidation,
  });
  const create = useMutation({
    mutationFn: () => api.createRepository(input(), { mode: 'commit' }),
  });
  const busy = review.isPending || create.isPending;
  const ready = form.team.trim().length > 0 && form.name.trim().length > 0;
  const failure = (create.error ?? review.error) as Error | null;
  const created = create.data;

  const set =
    <K extends keyof DeclarationForm>(key: K) =>
    (value: string) => {
      setForm(current => ({ ...current, [key]: value }));
      // A changed form is a new declaration: its dry run is gone.
      setValidation(undefined);
      review.reset();
    };

  const onReview = (event: FormEvent) => {
    event.preventDefault();
    if (ready && !busy) {
      review.mutate();
    }
  };

  const field = (
    key: Exclude<keyof DeclarationForm, 'reason' | 'description'>,
    label: string,
    description: string,
    required = false,
  ) => (
    <TextField
      label={label}
      description={description}
      isRequired={required}
      value={form[key]}
      onChange={set(key)}
      isInvalid={refused(validation, key)}
      isDisabled={!!created}
    />
  );

  return (
    <Content>
      <Typography variant="body2" style={{ marginBottom: 16 }}>
        <Link to={rootLink?.() ?? '/repositories'}>← Repositories</Link>
      </Typography>
      <Typography variant="h5" gutterBottom>
        Create repository
      </Typography>
      <Text variant="body-small" color="secondary">
        A new repository of the giantswarm org is declared: an entry in the
        team's file (repositories/&lt;team&gt;.yaml in giantswarm/github),
        opened as a pull request under your name. Once it merges, the reconciler
        creates and scaffolds the repository and sets it up; its first release
        follows. Review shows the entry exactly as the manager would write it,
        with its verdict.
      </Text>

      <form onSubmit={onReview} aria-label="Create repository">
        <Box mt={2} maxWidth={720}>
          <Flex direction="column" gap="3">
            {field(
              'team',
              'Team',
              "The owning team's file, as its GitHub slug: team-bumblebee, team-planeteers, …",
              true,
            )}
            {field(
              'name',
              'Name',
              'The repository name in the giantswarm org.',
              true,
            )}
            {field(
              'componentType',
              'Component type',
              'service, library, cli, appcatalog, configuration, customer, template, unspecified — as the schema names them.',
            )}
            {field(
              'language',
              'Language',
              'gen.language: go, node, python, generic, … — decides the template (giantswarm/template for Go).',
            )}
            {field(
              'flavours',
              'Flavours',
              'gen.flavours, comma-separated: app, cli, cluster-app, helmchart, …',
            )}
            <TextAreaField
              label="Description"
              description="The repository description on GitHub."
              value={form.description}
              onChange={set('description')}
              isDisabled={!!created}
              rows={2}
            />
            {field(
              'visibility',
              'Visibility',
              'public or private; the schema decides the default.',
            )}
            <TextField
              label="Reason"
              description="Why, for the pull request body."
              value={form.reason}
              onChange={set('reason')}
              isDisabled={!!created}
            />
          </Flex>
        </Box>

        {validation && (
          <Box mt={3}>
            <DryRunPanel validation={validation} />
          </Box>
        )}
        {failure && (
          <Box mt={2}>
            <RepositoriesErrorAlert title={REFUSED_TITLE} error={failure} />
          </Box>
        )}
        {created && (
          <Box mt={2}>
            <PullRequestOpened result={created} />
          </Box>
        )}

        {!created && (
          <Box mt={2}>
            <Flex gap="2">
              <Button
                type="submit"
                variant={validation ? 'secondary' : 'primary'}
                isDisabled={!ready || busy}
              >
                {review.isPending ? 'Rendering…' : 'Review'}
              </Button>
              {validation && (
                <Button
                  variant="primary"
                  isDisabled={busy}
                  onPress={() => create.mutate()}
                >
                  {create.isPending ? 'Creating…' : 'Create'}
                </Button>
              )}
            </Flex>
          </Box>
        )}
      </form>

      {created && (
        <Box mt={3} data-testid="live-setup">
          <Typography variant="subtitle1" gutterBottom>
            Set-up of {form.name.trim()}
          </Typography>
          <LiveSetup repository={form.name.trim()} />
        </Box>
      )}
    </Content>
  );
}
