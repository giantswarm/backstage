import { type ReactNode, useEffect } from 'react';
import {
  Alert,
  Button,
  Flex,
  Radio,
  RadioGroup,
  Select,
  Text,
} from '@backstage/ui';
import {
  searchableIf,
  useGroupFieldError,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import {
  ACCESS_GRANT_HINT,
  OWNER_LABEL,
  ownerOf,
  TENANT_KIND_LABELS,
  tenantGroups,
  tenantKindOf,
  type TenantKind,
} from '../../lib/tenants';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { LabelledField } from '../LabelledField';

const DESCRIPTION = 'Who can use the agent, and whose editors can change it.';

/** What each kind means, after its label on the radio. */
const KIND_EXPLANATIONS: Record<TenantKind, string> = {
  platform: 'the platform’s agents, for everyone',
  organization: 'one organization’s agents, for its people',
  namespace: 'the agents of a namespace that is no organization',
};

/** Which of a field's problems shows now: `useFieldValidation`'s `errorFor`. */
export type TenantErrorFor = (
  field: 'tenant',
  problem: string | undefined,
) => string | undefined;

export type OwnerFieldOptions = {
  /**
   * Decides when the field's problem shows (the `forms` skill). None shows
   * without.
   */
  errorFor?: TenantErrorFor;
};

const quiet: TenantErrorFor = () => undefined;

export type OwnerField = {
  /**
   * Whether the field is a choice (or says why there is none), which puts it
   * and Environment in the main form; otherwise a line, or nothing.
   */
  inMain: boolean;
  /** The sole tenant's namespace, when the field is a line. */
  sole?: string;
  /** The field itself, for the page to put directly after Environment. */
  field: ReactNode;
};

/**
 * Who a new agent belongs to, its owner: the platform, an organization, or
 * another namespace on the picked environment in which the person may create
 * agents, as agent-manager answers it for them (`get_info`'s
 * `namespaces.managed`, checked per namespace with a
 * `SelfSubjectAccessReview`). Never a namespace typed by hand.
 *
 * Where several kinds are offered, the person chooses one in a radio group,
 * Platform first and preselected: the platform is no organization, so the
 * either/or stays in sight. Organization (or Other namespace) then offers its
 * namespaces by plain name in a dropdown below, one always picked
 * (`selectTenantKind`). A single kind with several namespaces is the dropdown
 * alone, its first picked. The only place is picked and stated in a line,
 * for the page to put under More options. Renders nothing until an
 * environment is picked and agent-manager has answered, or while editing,
 * where the agent stays where it is.
 *
 * A hook rather than a component for the reason `useEnvironmentField` is
 * one: the page mounts it once, and places its field with Environment's.
 */
export function useOwnerField({
  errorFor = quiet,
}: OwnerFieldOptions = {}): OwnerField {
  const {
    state,
    edit,
    fieldErrors,
    setTenantChoices,
    setTenantChoicesFailed,
    selectTenant,
    selectTenantKind,
  } = useNewAgentForm();
  const installation = edit ? undefined : state.installation;
  const { info, isLoading, canRead, refetch } =
    useAgentManagerInfo(installation);
  const answered = info?.namespaces?.managed;
  const choicesKey = answered?.join(',');
  // The places as the form holds them: agent-manager's answer once
  // `setTenantChoices` has taken it (and picked one), so the field never
  // shows a pick the form does not hold.
  const managed =
    answered && state.tenantChoices?.join(',') === choicesKey
      ? answered
      : undefined;
  // agent-manager answered without the places or failed; or there is no
  // muster plugin to ask, which the Environment field explains (no Check
  // again then: there is nothing to read again).
  const failed =
    Boolean(installation) && (!canRead || (!isLoading && !answered));

  useEffect(() => {
    if (choicesKey !== undefined) {
      setTenantChoices(choicesKey ? choicesKey.split(',') : []);
    }
  }, [choicesKey, setTenantChoices]);
  useEffect(() => {
    setTenantChoicesFailed(failed);
  }, [failed, setTenantChoicesFailed]);

  // A blocked Continue's problem while there is nothing to pick from yet.
  // Once there is, one is always picked, so the choice itself has none.
  const unreadError = useGroupFieldError(
    !managed ? errorFor('tenant', fieldErrors.tenant) : undefined,
  );

  if (!installation) {
    return { inMain: false, field: null };
  }
  if (!managed) {
    // Still reading, or agent-manager did not answer (or the form has not
    // taken its answer yet). Nothing, rather than a line that would vanish a
    // moment later in the common single-place case, until a blocked Continue
    // asks for the owner: then the field says why there is none yet, and
    // offers to read it again where it failed.
    if (!unreadError.message) {
      return { inMain: false, field: null };
    }
    return {
      inMain: true,
      field: (
        <LabelledField label={OWNER_LABEL} description={DESCRIPTION}>
          <div aria-label={OWNER_LABEL} {...unreadError.groupProps}>
            {unreadError.message}
            {failed && canRead && (
              <Button
                size="small"
                variant="secondary"
                onPress={() => refetch()}
              >
                Check again
              </Button>
            )}
          </div>
        </LabelledField>
      ),
    };
  }

  if (managed.length === 0) {
    return {
      inMain: true,
      field: (
        <LabelledField label={OWNER_LABEL} description={DESCRIPTION}>
          <Alert
            status="warning"
            title="You may not create agents here"
            description={`On ${installation}, you may create agents neither for the platform nor for an organization. ${ACCESS_GRANT_HINT}`}
          />
        </LabelledField>
      ),
    };
  }

  if (managed.length === 1) {
    // Nothing to choose: a line says who owns it.
    return {
      inMain: false,
      sole: managed[0],
      field: (
        <Text as="p" variant="body-small" color="secondary">
          {OWNER_LABEL}: <strong>{ownerOf(managed[0])}</strong>, the only one
          you may create agents for on {installation}.
        </Text>
      ),
    };
  }

  const { kinds, byKind } = tenantGroups(managed);
  const offersKind = kinds.length > 1;
  // One is always picked once there are choices (`setTenantChoices`).
  const pickedKind = state.tenant ? tenantKindOf(state.tenant) : kinds[0];
  // The kind whose dropdown shows: the one chosen, or the only one.
  const dropdownKind = offersKind ? pickedKind : kinds[0];
  const dropdownChoices = byKind[dropdownKind];

  const dropdown =
    dropdownKind === 'platform' ? null : (
      <Select
        // Labelled by the radio it belongs to, or as the field where it is
        // the field.
        {...(offersKind
          ? { 'aria-label': TENANT_KIND_LABELS[dropdownKind] }
          : { label: OWNER_LABEL, description: DESCRIPTION })}
        isRequired
        searchable={searchableIf(dropdownChoices)}
        options={dropdownChoices.map(namespace => ({
          id: namespace,
          // Under Other namespace, the namespace's own name.
          label: dropdownKind === 'namespace' ? namespace : ownerOf(namespace),
        }))}
        selectedKey={
          state.tenant && dropdownChoices.includes(state.tenant)
            ? state.tenant
            : null
        }
        onSelectionChange={key => {
          if (key) {
            selectTenant(String(key));
          }
        }}
      />
    );

  if (!offersKind) {
    return { inMain: true, field: dropdown };
  }

  return {
    inMain: true,
    field: (
      <Flex direction="column" gap="2">
        <RadioGroup
          label={OWNER_LABEL}
          description={DESCRIPTION}
          isRequired
          value={pickedKind}
          onChange={value => selectTenantKind(value as TenantKind)}
        >
          {kinds.map(kind => (
            <Radio key={kind} value={kind}>
              {TENANT_KIND_LABELS[kind]} — {KIND_EXPLANATIONS[kind]}
            </Radio>
          ))}
        </RadioGroup>
        {dropdown}
      </Flex>
    ),
  };
}
