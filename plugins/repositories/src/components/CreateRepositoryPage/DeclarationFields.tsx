import { ReactNode, useId } from 'react';
import { Typography } from '@material-ui/core';
import {
  Checkbox,
  CheckboxGroup,
  Flex,
  Radio,
  RadioGroup,
  Select,
  Text,
  TextAreaField,
  TextField,
} from '@backstage/ui';
import { Validation } from '../../apis';
import {
  COMPONENT_TYPES,
  CUSTOM_KIND,
  DeclarationForm,
  FLAVOURS,
  KINDS,
  kindOf,
  LANGUAGES,
  nameProblem,
  refused,
  VISIBILITIES,
  withGen,
  withKind,
} from '../../lib/declaration';
import { TeamOption } from '../../lib/scope';

export const CI_GENERATE_LABEL = 'Generate CircleCI config';

/** The choice whose id is `private`: the org's default, left out of the entry. */
const PRIVATE = VISIBILITIES[0].id;

export interface DeclarationFieldsProps {
  form: DeclarationForm;
  onChange: (form: DeclarationForm) => void;
  /** The teams to file for, the caller's own first. */
  teams: TeamOption[];
  /** The teams are still being read. */
  teamsLoading: boolean;
  /**
   * The manager's dry run of the form as it stands: the fields it refused
   * are marked, the name's verdict shows under the name.
   */
  validation?: Validation;
  /** A dry run for the form as it stands is in flight: the verdict shown is the last one. */
  checking: boolean;
  /** The repository was created: the declaration is frozen. */
  isDisabled: boolean;
}

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <Flex direction="column" gap="3" data-testid={testId}>
      <Typography variant="subtitle1" component="h2">
        {title}
      </Typography>
      {children}
    </Flex>
  );
}

/**
 * A choice as a radio: its name in bold, what it means underneath. The name
 * is the radio's accessible name; the description is what describes it.
 */
function ChoiceRadio({
  value,
  label,
  description,
}: {
  value: string;
  label: string;
  description?: string;
}) {
  const descriptionId = useId();
  return (
    <Radio
      value={value}
      aria-label={label}
      aria-describedby={description ? descriptionId : undefined}
    >
      <Flex direction="column" gap="0.5">
        <Text variant="body-medium" weight="bold">
          {label}
        </Text>
        {description && (
          <Text id={descriptionId} variant="body-small" color="secondary">
            {description}
          </Text>
        )}
      </Flex>
    </Radio>
  );
}

/** The manager's verdict on the name, for the line under the field. */
function nameVerdict(
  name: string,
  validation: Validation | undefined,
): { text: string; ok: boolean } | undefined {
  const entry = validation?.entries.find(candidate => candidate.name === name);
  if (!entry) {
    return undefined;
  }
  const { verdict, detail } = entry.nameCheck;
  switch (verdict) {
    case 'free':
      return { text: `giantswarm/${name} is free on GitHub`, ok: true };
    case 'taken':
      return { text: `taken${detail ? `: ${detail}` : ''}`, ok: false };
    default:
      return {
        text: `name ${verdict}${detail ? `: ${detail}` : ''}`,
        ok: true,
      };
  }
}

/**
 * The declaration as a form: the repository (team, name, description,
 * visibility), its kind -- one of the shapes the org's team files declare,
 * which fills the generation fields -- the generation fields themselves
 * (component type, language, flavours, the CircleCI switch) and the reason
 * for the pull request. Every enumerated field is a choice, not a text: the
 * values are the schema's. The name is checked against the engine's rule as
 * typed; the manager's verdict on it (free, taken) shows once the dry run
 * answers.
 */
export function DeclarationFields({
  form,
  onChange,
  teams,
  teamsLoading,
  validation,
  checking,
  isDisabled,
}: DeclarationFieldsProps) {
  const name = form.name.trim();
  const problem = nameProblem(name, form.flavours);
  const verdict = checking ? undefined : nameVerdict(name, validation);
  const teamPlaceholder = teamsLoading
    ? 'Reading your teams…'
    : 'Pick the owning team';

  return (
    <Flex direction="column" gap="6">
      <Section title="Repository" testId="section-repository">
        <Select
          label="Team"
          isRequired
          description="The owning team: its file repositories/<team>.yaml in giantswarm/github takes the entry."
          placeholder={teamPlaceholder}
          options={teams.map(team => ({ id: team.id, label: team.label }))}
          selectedKey={form.team || null}
          onSelectionChange={key =>
            key && onChange({ ...form, team: String(key) })
          }
          isDisabled={isDisabled}
        />
        <Flex direction="column" gap="1">
          <TextField
            label="Name"
            isRequired
            description="The repository name in the giantswarm org, lowercase; a chart repository is named after its chart."
            placeholder="my-operator"
            value={form.name}
            onChange={value => onChange({ ...form, name: value })}
            isInvalid={!!problem || refused(validation, 'name')}
            isDisabled={isDisabled}
          />
          {(problem || verdict) && (
            <Text
              variant="body-small"
              color={problem || !verdict?.ok ? 'danger' : 'success'}
              data-testid="name-check"
            >
              {problem ?? verdict?.text}
            </Text>
          )}
        </Flex>
        <TextAreaField
          label="Description"
          description="The About text on GitHub; the automation keeps it in sync."
          value={form.description}
          onChange={value => onChange({ ...form, description: value })}
          isInvalid={refused(validation, 'description')}
          isDisabled={isDisabled}
          rows={2}
        />
        <RadioGroup
          label="Visibility"
          orientation="horizontal"
          value={form.visibility || PRIVATE}
          onChange={value =>
            onChange({ ...form, visibility: value === PRIVATE ? '' : value })
          }
          isInvalid={refused(validation, 'visibility')}
          isDisabled={isDisabled}
        >
          {VISIBILITIES.map(choice => (
            <ChoiceRadio key={choice.id} value={choice.id} {...choice} />
          ))}
        </RadioGroup>
      </Section>

      <Section title="Kind" testId="section-kind">
        <RadioGroup
          aria-label="Kind"
          description="Sets the component type, language and flavours below, and the CircleCI switch where the kind has a job to run. Every field stays yours to change."
          value={kindOf(form)}
          onChange={id => onChange(withKind(form, id))}
          isDisabled={isDisabled}
        >
          {KINDS.map(kind => (
            <ChoiceRadio
              key={kind.id}
              value={kind.id}
              label={kind.label}
              description={kind.description}
            />
          ))}
          <ChoiceRadio
            value={CUSTOM_KIND}
            label="Custom"
            description="Component type, language and flavours as set below."
          />
        </RadioGroup>
      </Section>

      <Section title="Generated files" testId="section-generated">
        <Flex gap="3" style={{ flexWrap: 'wrap' }}>
          <Select
            label="Component type"
            isRequired
            description="componentType: how the catalog shows it; with the language and flavours it picks the template."
            options={COMPONENT_TYPES}
            selectedKey={form.componentType}
            onSelectionChange={key =>
              key && onChange(withGen(form, { componentType: String(key) }))
            }
            isInvalid={refused(validation, 'componentType')}
            isDisabled={isDisabled}
            style={{ flex: '1 1 220px' }}
          />
          <Select
            label="Language"
            isRequired
            description="gen.language: the template and the build job."
            options={LANGUAGES}
            selectedKey={form.language}
            onSelectionChange={key =>
              key && onChange(withGen(form, { language: String(key) }))
            }
            isInvalid={refused(validation, 'language')}
            isDisabled={isDisabled}
            style={{ flex: '1 1 220px' }}
          />
        </Flex>
        <Flex direction="column" gap="1">
          <CheckboxGroup
            label="Flavours"
            isRequired
            description="gen.flavours: what devctl generates for the repository."
            orientation="horizontal"
            value={form.flavours}
            onChange={flavours => onChange(withGen(form, { flavours }))}
            isInvalid={
              form.flavours.length === 0 || refused(validation, 'flavours')
            }
            isDisabled={isDisabled}
          >
            {FLAVOURS.map(flavour => (
              <Checkbox key={flavour.id} value={flavour.id}>
                <span style={{ whiteSpace: 'nowrap' }}>{flavour.label}</span>
              </Checkbox>
            ))}
          </CheckboxGroup>
          <Text variant="body-x-small" color="secondary">
            {FLAVOURS.map(
              flavour => `${flavour.label}: ${flavour.description}`,
            ).join(' · ')}
          </Text>
        </Flex>
        <Flex direction="column" gap="1">
          <Checkbox
            isSelected={form.ciGenerate}
            onChange={ciGenerate => onChange({ ...form, ciGenerate })}
            isInvalid={refused(validation, 'ciGenerate')}
            isDisabled={isDisabled}
          >
            {CI_GENERATE_LABEL}
          </Checkbox>
          <Text variant="body-small" color="secondary">
            gen.ci.generate: align-files generates .circleci/config.yml from the
            declaration and keeps it current. Needs something to build — a Go or
            Node build or the app flavour's chart; off for a repository without
            one, such as a configuration repository. Follows the kind, language
            and flavours until you set it.
          </Text>
        </Flex>
      </Section>

      <Section title="Pull request" testId="section-pull-request">
        <TextField
          label="Reason"
          description="Why this repository — the pull request body carries it."
          value={form.reason}
          onChange={value => onChange({ ...form, reason: value })}
          isDisabled={isDisabled}
        />
      </Section>
    </Flex>
  );
}
