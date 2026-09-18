import { ReactNode, useEffect, useId, useState } from 'react';
import { Typography } from '@material-ui/core';
import {
  Button,
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
  Addon,
  addonAllowed,
  ADDONS,
  addonsOf,
  COMPONENT_TYPES,
  DECLARATION_FIELDS,
  DeclarationForm,
  flavourProblem,
  LANGUAGES,
  nameProblem,
  natureOf,
  NATURES,
  presetOf,
  PRESETS,
  refused,
  VISIBILITIES,
  withAddons,
  withGen,
  withNature,
  withPreset,
} from '../../lib/declaration';
import { TeamOption } from '../../lib/scope';

export const CI_GENERATE_LABEL = 'Generate CircleCI config';
export const ALIGN_LABEL = 'Opted in to alignment';

/** The choice whose id is `private`: the org's default, left out of the entry. */
const PRIVATE = VISIBILITIES[0].id;

/**
 * Whose declaration the form holds. A new repository's: the team is a choice
 * among `teams`, the name is typed and checked as typed. An existing entry's:
 * the team and the name are fixed (Transfer moves a repository; a rename is
 * followed by the reconciler, not declared), the opt-in to alignment is on
 * the form, and the entry's fields the form does not carry are named as kept.
 */
export type DeclarationSubject =
  | { kind: 'new'; teams: TeamOption[]; teamsLoading: boolean }
  | {
      kind: 'existing';
      repository: string;
      team: string;
      file: string;
      /** The entry's fields the form does not carry, dotted. */
      kept: string[];
    };

type NewRepository = Extract<DeclarationSubject, { kind: 'new' }>;
type ExistingEntry = Extract<DeclarationSubject, { kind: 'existing' }>;

export interface DeclarationFieldsProps {
  form: DeclarationForm;
  onChange: (form: DeclarationForm) => void;
  subject: DeclarationSubject;
  /**
   * The manager's dry run of the form as it stands: the fields it refused
   * are marked, the name's verdict shows under the name.
   */
  validation?: Validation;
  /** A dry run for the form as it stands is in flight: the verdict shown is the last one. */
  checking?: boolean;
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

/** A choice's name in bold with what it means underneath, for a radio or checkbox. */
function ChoiceText({
  label,
  description,
  descriptionId,
}: {
  label: string;
  description?: string;
  descriptionId: string;
}) {
  return (
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
      <ChoiceText
        label={label}
        description={description}
        descriptionId={descriptionId}
      />
    </Radio>
  );
}

/**
 * An add-on flavour as a checkbox, disabled with the nature it needs when
 * the declaration has another.
 */
function AddonCheckbox({
  addon,
  nature,
  isDisabled,
}: {
  addon: Addon;
  nature: string | undefined;
  isDisabled: boolean;
}) {
  const descriptionId = useId();
  const allowed = addonAllowed(addon, nature);
  const description = allowed
    ? addon.description
    : `${addon.description} Only with the ${addon.needs} nature.`;
  return (
    <Checkbox
      value={addon.id}
      aria-label={addon.label}
      aria-describedby={descriptionId}
      isDisabled={isDisabled || !allowed}
    >
      <ChoiceText
        label={addon.label}
        description={description}
        descriptionId={descriptionId}
      />
    </Checkbox>
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
 * The declaration's generation fields in one line: `service · go · app ·
 * CircleCI config generated`; an entry without one of them says so.
 */
export function summaryOf(form: DeclarationForm): string {
  return [
    form.componentType || 'no catalog type',
    form.language || 'no language',
    form.flavours.length > 0 ? form.flavours.join(' + ') : 'no flavours',
    `CircleCI config ${form.ciGenerate ? 'generated' : 'not generated'}`,
  ].join(' · ');
}

/**
 * The declaration's generation fields as the preset's result: one line
 * summing them up and where it came from, and **Adjust**, which opens the
 * raw controls -- catalog type, language, the nature and add-ons, the
 * CircleCI switch -- for the shape no preset fits. The controls open by
 * themselves when the manager refuses one of the fields or the generator's
 * rule is broken, so the mark is seen.
 */
function Declaration({
  form,
  onChange,
  validation,
  isDisabled,
}: Pick<
  DeclarationFieldsProps,
  'form' | 'onChange' | 'validation' | 'isDisabled'
>) {
  const panelId = useId();
  const [adjusting, setAdjusting] = useState(false);
  const preset = PRESETS.find(candidate => candidate.id === presetOf(form));
  const nature = natureOf(form.flavours);
  const rule = flavourProblem(form.language, form.flavours);
  const marked =
    !!rule || DECLARATION_FIELDS.some(field => refused(validation, field));
  useEffect(() => {
    if (marked) {
      setAdjusting(true);
    }
  }, [marked]);

  return (
    <Flex direction="column" gap="3">
      <Flex justify="between" align="start" gap="3">
        <Flex direction="column" gap="0.5">
          <Text
            variant="body-medium"
            weight="bold"
            data-testid="declaration-summary"
          >
            {summaryOf(form)}
          </Text>
          <Text
            variant="body-small"
            color="secondary"
            data-testid="declaration-source"
          >
            {preset
              ? `Set by the ${preset.label} preset.`
              : 'Adjusted by hand: no preset matches.'}
          </Text>
        </Flex>
        <Button
          variant="secondary"
          size="small"
          aria-expanded={adjusting}
          aria-controls={adjusting ? panelId : undefined}
          onPress={() => setAdjusting(!adjusting)}
          isDisabled={isDisabled}
        >
          {adjusting ? 'Done' : 'Adjust'}
        </Button>
      </Flex>
      {adjusting && (
        <Flex
          direction="column"
          gap="4"
          id={panelId}
          data-testid="declaration-fields"
        >
          <Flex gap="3" style={{ flexWrap: 'wrap' }}>
            <Select
              label="Catalog type"
              isRequired
              description="componentType: how the Dev Portal's catalog shows the repository; with the language and flavours it picks the template."
              options={COMPONENT_TYPES}
              selectedKey={form.componentType || null}
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
              selectedKey={form.language || null}
              onSelectionChange={key =>
                key && onChange(withGen(form, { language: String(key) }))
              }
              isInvalid={refused(validation, 'language')}
              isDisabled={isDisabled}
              style={{ flex: '1 1 220px' }}
            />
          </Flex>
          <Flex direction="column" gap="1">
            <RadioGroup
              label="Nature"
              isRequired
              description="gen.flavours: what devctl generates for the repository. One nature each; the add-ons come on top."
              value={nature ?? null}
              onChange={value => onChange(withNature(form, value))}
              isInvalid={!!rule || refused(validation, 'flavours')}
              isDisabled={isDisabled}
            >
              {NATURES.map(choice => (
                <ChoiceRadio key={choice.id} value={choice.id} {...choice} />
              ))}
            </RadioGroup>
            {rule && (
              <Text
                variant="body-small"
                color="danger"
                data-testid="flavour-check"
              >
                {rule}
              </Text>
            )}
          </Flex>
          <CheckboxGroup
            label="Add-ons"
            description="gen.flavours, on top of the nature."
            value={addonsOf(form.flavours)}
            onChange={addons => onChange(withAddons(form, addons))}
            isInvalid={refused(validation, 'flavours')}
            isDisabled={isDisabled}
          >
            {ADDONS.map(addon => (
              <AddonCheckbox
                key={addon.id}
                addon={addon}
                nature={nature}
                isDisabled={isDisabled}
              />
            ))}
          </CheckboxGroup>
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
              gen.ci.generate: align-files generates .circleci/config.yml from
              the declaration and keeps it current. Needs something to build — a
              Go or Node build or the app nature's chart. Follows the preset,
              language and flavours until you set it.
            </Text>
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}

/**
 * A new repository's team -- a choice, the caller's own first -- and name,
 * typed and checked against the engine's rule as typed; the manager's
 * verdict on the name (free, taken) shows once the dry run answers.
 */
function NewRepositoryFields({
  form,
  onChange,
  subject,
  validation,
  checking,
  isDisabled,
}: Pick<
  DeclarationFieldsProps,
  'form' | 'onChange' | 'validation' | 'checking' | 'isDisabled'
> & { subject: NewRepository }) {
  const name = form.name.trim();
  const problem = nameProblem(name, form.flavours);
  const verdict = checking ? undefined : nameVerdict(name, validation);
  const teamPlaceholder = subject.teamsLoading
    ? 'Reading your teams…'
    : 'Pick the owning team';
  return (
    <>
      <Select
        label="Team"
        isRequired
        description="The owning team: its file repositories/<team>.yaml in giantswarm/github takes the entry."
        placeholder={teamPlaceholder}
        options={subject.teams.map(team => ({
          id: team.id,
          label: team.label,
        }))}
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
    </>
  );
}

/**
 * An existing entry's repository, team and file -- fixed -- and the fields
 * of the entry the form does not carry, which the edit keeps as they are.
 */
function ExistingEntryFields({ subject }: { subject: ExistingEntry }) {
  return (
    <Flex direction="column" gap="1" data-testid="existing-entry">
      <Text variant="body-medium" weight="bold">
        {subject.repository}
      </Text>
      <Text variant="body-small" color="secondary">
        Declared by {subject.team} in {subject.file}. The name and the team are
        not edited here: a rename is followed by the reconciler, not declared,
        and Transfer moves the repository to another team.
      </Text>
      {subject.kept.length > 0 && (
        <Text variant="body-small" color="secondary" data-testid="kept-fields">
          Kept as they are: {subject.kept.join(', ')}.
        </Text>
      )}
    </Flex>
  );
}

/** The repository's opt-in to alignment, `align`, on an existing entry's form. */
function AlignmentField({
  form,
  onChange,
  validation,
  isDisabled,
}: Pick<
  DeclarationFieldsProps,
  'form' | 'onChange' | 'validation' | 'isDisabled'
>) {
  const hintId = useId();
  return (
    <Flex direction="column" gap="1">
      <Checkbox
        isSelected={form.align === true}
        onChange={align => onChange({ ...form, align })}
        aria-describedby={hintId}
        isInvalid={refused(validation, 'align')}
        isDisabled={isDisabled}
      >
        {ALIGN_LABEL}
      </Checkbox>
      <Text id={hintId} variant="body-small" color="secondary">
        align: the reconciler changes the repository on GitHub and CircleCI to
        its declared set-up and the company baseline — settings, permissions,
        branch protection, the CircleCI project — on every run. Without it the
        runs check and report the drift and change nothing.
      </Text>
    </Flex>
  );
}

/**
 * The declaration as a form: the repository (team and name -- chosen and
 * typed for a new one, fixed for an existing entry -- description,
 * visibility); the one question -- what it is -- as a preset, one of the
 * shapes the org's team files declare, which fills the declaration; the
 * declaration itself (catalog type, language, flavours, the CircleCI switch)
 * as that preset's result, adjustable; for an existing entry the opt-in to
 * alignment; and the reason for the pull request. Every enumerated field is
 * a choice, not a text: the values are the schema's.
 */
export function DeclarationFields({
  form,
  onChange,
  subject,
  validation,
  checking = false,
  isDisabled,
}: DeclarationFieldsProps) {
  const presetHintId = useId();
  const existing = subject.kind === 'existing';
  const question = existing ? 'What is it?' : 'What are you creating?';

  return (
    <Flex direction="column" gap="6">
      <Section title="Repository" testId="section-repository">
        {subject.kind === 'new' ? (
          <NewRepositoryFields
            form={form}
            onChange={onChange}
            subject={subject}
            validation={validation}
            checking={checking}
            isDisabled={isDisabled}
          />
        ) : (
          <ExistingEntryFields subject={subject} />
        )}
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

      <Section title={question} testId="section-preset">
        <Text variant="body-small" color="secondary" id={presetHintId}>
          A preset: it fills the declaration below the way the team files
          declare that shape. Adjust the declaration for a shape none fits.
        </Text>
        <RadioGroup
          aria-label={question}
          aria-describedby={presetHintId}
          value={presetOf(form) ?? null}
          onChange={id => onChange(withPreset(form, id))}
          isDisabled={isDisabled}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '8px 16px',
            }}
          >
            {PRESETS.map(preset => (
              <ChoiceRadio
                key={preset.id}
                value={preset.id}
                label={preset.label}
                description={preset.description}
              />
            ))}
          </div>
        </RadioGroup>
      </Section>

      <Section title="Declaration" testId="section-declaration">
        <Declaration
          form={form}
          onChange={onChange}
          validation={validation}
          isDisabled={isDisabled}
        />
      </Section>

      {existing && (
        <Section title="Alignment" testId="section-alignment">
          <AlignmentField
            form={form}
            onChange={onChange}
            validation={validation}
            isDisabled={isDisabled}
          />
        </Section>
      )}

      <Section title="Pull request" testId="section-pull-request">
        <TextField
          label="Reason"
          description={
            existing
              ? 'Why this change — the pull request body carries it.'
              : 'Why this repository — the pull request body carries it.'
          }
          value={form.reason}
          onChange={value => onChange({ ...form, reason: value })}
          isDisabled={isDisabled}
        />
      </Section>
    </Flex>
  );
}
