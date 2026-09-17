import { FormEvent, useEffect, useState } from 'react';
import { Content, Link } from '@backstage/core-components';
import { Box, Typography } from '@material-ui/core';
import {
  Button,
  Checkbox,
  Flex,
  Text,
  TextAreaField,
  TextField,
} from '@backstage/ui';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  DeclarationEntry,
  DeclarationInput,
  Problem,
  repositoriesApiRef,
  Validation,
} from '../../apis';
import { teamsOf } from '../../lib/scope';
import { REFUSED_TITLE } from '../actions/ActionDialog';
import { ProblemFix } from '../actions/PlanView';
import { RepositoriesErrorAlert } from '../RepositoriesErrorAlert';
import { rootRouteRef } from '../../routes';
import { DryRunPanel } from './DryRunPanel';
import { LiveSetup } from './LiveSetup';
import { RepositoryCreated } from './RepositoryCreated';

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
  /** `gen.ci.generate`: align-files generates and keeps the CircleCI config. */
  ciGenerate: boolean;
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
  ciGenerate: true,
  reason: '',
};

const CI_GENERATE_LABEL = 'Generate CircleCI config';

/**
 * The entry field each form field writes, dotted the way the manager's
 * refusals name it (`gen.flavours[1]` names flavours).
 */
const ENTRY_FIELDS = {
  name: 'name',
  componentType: 'componentType',
  language: 'gen.language',
  flavours: 'gen.flavours',
  description: 'description',
  visibility: 'visibility',
  ciGenerate: 'gen.ci.generate',
} as const satisfies Partial<Record<keyof DeclarationForm, string>>;

type EntryField = keyof typeof ENTRY_FIELDS;

/**
 * The entry the form describes, as it goes into the team file: `name`,
 * `componentType`, `gen: {language, flavours, ci: {generate}}`,
 * `description`, `visibility`. Empty fields are left out so the schema's
 * defaults apply; every value is handed on as typed -- the manager's dry run
 * says what it makes of it. `gen.ci.generate` is written out, true or false,
 * the way `devctl repo create` writes it: align-files reads the team file,
 * not the dry run, and an unset `generate` is not `true` to it.
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
  gen.ci = { generate: form.ciGenerate };
  return {
    name: form.name.trim(),
    ...(form.componentType.trim() && {
      componentType: form.componentType.trim(),
    }),
    gen,
    ...(form.description.trim() && { description: form.description.trim() }),
    ...(form.visibility.trim() && { visibility: form.visibility.trim() }),
  };
}

/** The tools' arguments for the form: the same for the dry run and the commit. */
export function toInput(form: DeclarationForm): DeclarationInput {
  return {
    team: form.team.trim(),
    entry: toEntry(form),
    reason: form.reason.trim() || undefined,
  };
}

/** The form field a refusal names, if any (`gen.flavours[1]` → flavours). */
function fieldOf(problem: Problem): EntryField | undefined {
  const path = problem.field.replace(/\[\d+\]$/, '');
  return (Object.keys(ENTRY_FIELDS) as EntryField[]).find(
    key => ENTRY_FIELDS[key] === path,
  );
}

/** Whether a refusal names this form field. */
function refused(validation: Validation | undefined, field: EntryField) {
  return !!validation?.entries.some(entry =>
    entry.problems?.some(problem => fieldOf(problem) === field),
  );
}

/** The value a refusal of a boolean field tells the person to set: `…; set it to false`. */
const SET_IT_TO = /\bset it to (true|false)\b/;

/**
 * The fix a refusal names, as a change to the form: the CircleCI switch's
 * refusal says which value to set, so it is one click. A refusal of a text
 * field marks the field; what to type is the person's.
 */
export function fixOf(problem: Problem): Partial<DeclarationForm> | undefined {
  if (fieldOf(problem) !== 'ciGenerate') {
    return undefined;
  }
  const match = SET_IT_TO.exec(problem.message);
  return match ? { ciGenerate: match[1] === 'true' } : undefined;
}

/**
 * Create repository: the declaration form, its dry run as
 * `validate_repository` renders it (the entry with defaults, the template,
 * the name check, the refusals with their fix, the guard notices and the
 * creation as the person would run it), then **Create** --
 * `create_repository` in `mode: commit`: the repository and one scaffold
 * commit as the signed-in person, then the team-file pull request under
 * their name -- and the set-up steps of the new repository completing live
 * once the reconciler has it. The page holds no schema of its own: every
 * field is handed on as typed and the manager's verdict is what shows.
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

  const review = useMutation({
    mutationFn: (input: DeclarationInput) => api.validateRepository(input),
    onSuccess: setValidation,
  });
  const create = useMutation({
    mutationFn: () => api.createRepository(toInput(form), { mode: 'commit' }),
  });
  const busy = review.isPending || create.isPending;
  const ready = form.team.trim().length > 0 && form.name.trim().length > 0;
  const failure = (create.error ?? review.error) as Error | null;
  const created = create.data;

  // A changed form is a new declaration: its dry run is gone.
  const change = (changes: Partial<DeclarationForm>): DeclarationForm => {
    const next = { ...form, ...changes };
    setForm(next);
    setValidation(undefined);
    review.reset();
    return next;
  };
  const set =
    <K extends keyof DeclarationForm>(key: K) =>
    (value: DeclarationForm[K]) => {
      change({ [key]: value });
    };

  const onReview = (event: FormEvent) => {
    event.preventDefault();
    if (ready && !busy) {
      review.mutate(toInput(form));
    }
  };

  /** A refusal's fix as a button: the value applied, the dry run run again. */
  const fixFor = (problem: Problem): ProblemFix | undefined => {
    const fix = fixOf(problem);
    if (!fix || created) {
      return undefined;
    }
    return {
      label: `Set ${CI_GENERATE_LABEL} to ${fix.ciGenerate ? 'on' : 'off'}`,
      apply: () => review.mutate(toInput(change(fix))),
    };
  };

  const field = (
    key: Exclude<EntryField, 'ciGenerate' | 'description'> | 'team',
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
      isInvalid={key !== 'team' && refused(validation, key)}
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
        A new repository of the giantswarm org is created as you: the
        repository, one scaffold commit on its default branch (its first release
        follows from that push), then the declaration — an entry in the team's
        file (repositories/&lt;team&gt;.yaml in giantswarm/github) — as a pull
        request under your name. Review shows the entry and the plan exactly as
        the manager would carry them out.
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
            <Checkbox
              isSelected={form.ciGenerate}
              onChange={set('ciGenerate')}
              isInvalid={refused(validation, 'ciGenerate')}
              isDisabled={!!created}
            >
              {CI_GENERATE_LABEL}
            </Checkbox>
            <Text variant="body-small" color="secondary">
              gen.ci.generate: align-files generates .circleci/config.yml from
              the declaration and keeps it current. Needs something to build — a
              Go or Node build, the app flavour's chart, a Dockerfile; off for a
              repository without one, such as a configuration repository.
            </Text>
            <TextAreaField
              label="Description"
              description="The repository description on GitHub."
              value={form.description}
              onChange={set('description')}
              isInvalid={refused(validation, 'description')}
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
            <DryRunPanel validation={validation} fixFor={fixFor} />
          </Box>
        )}
        {failure && (
          <Box mt={2}>
            <RepositoriesErrorAlert title={REFUSED_TITLE} error={failure} />
          </Box>
        )}
        {created && (
          <Box mt={2}>
            <RepositoryCreated result={created} />
          </Box>
        )}

        {!created && (
          <Box mt={2}>
            <Flex gap="2">
              <Button
                type="submit"
                variant={validation?.accepted ? 'secondary' : 'primary'}
                isDisabled={!ready || busy}
              >
                {review.isPending ? 'Rendering…' : 'Review'}
              </Button>
              {validation?.accepted && (
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
