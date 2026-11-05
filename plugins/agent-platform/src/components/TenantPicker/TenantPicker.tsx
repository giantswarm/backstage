import { useEffect } from 'react';
import {
  Alert,
  Card,
  CardBody,
  Flex,
  Radio,
  RadioGroup,
  Select,
  Text,
} from '@backstage/ui';
import {
  searchableIf,
  SectionHeader,
  useSelectFieldError,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import {
  ACCESS_GRANT_HINT,
  TENANT_KIND_LABELS,
  tenantGroups,
  tenantInSentence,
  tenantOf,
  type TenantKind,
} from '../../lib/tenants';
import { useNewAgentForm } from '../NewAgentFormProvider';

const TITLE = 'Organization';

const DESCRIPTION = 'Who can use the agent, and whose editors can change it.';

/** What each kind means, after its label on the radio. */
const KIND_EXPLANATIONS: Record<TenantKind, string> = {
  platform: 'the platform’s agents, for everyone',
  organization: 'one organization’s agents, for its people',
  namespace: 'the agents of a namespace that is no organization',
};

/** The radio group's name; the e2e suite finds it by it. */
const KINDS_LABEL = 'Who the agent belongs to';

/** Which of a field's problems shows now: `useFieldValidation`'s `errorFor`. */
export type TenantErrorFor = (
  field: 'tenant' | 'tenantPick',
  problem: string | undefined,
) => string | undefined;

export type TenantPickerProps = {
  /**
   * Decides when each field's problem shows (the `forms` skill). Asked for
   * the dropdown's only while the dropdown is on screen, so one that appears
   * after a blocked Continue stays quiet until the next. None shows without.
   */
  errorFor?: TenantErrorFor;
};

const quiet: TenantErrorFor = () => undefined;

/**
 * Where a new agent is created: the platform, an organization, or another
 * namespace on the picked environment in which the person may create agents,
 * as agent-manager answers it for them (`get_info`'s `namespaces.managed`,
 * checked per namespace with a `SelfSubjectAccessReview`). Never a namespace
 * typed by hand. The only one is picked and named rather than offered. Where
 * several kinds are offered, the person chooses one (Platform, Organization,
 * Other namespace), and Organization or Other namespace then offers its
 * namespaces by plain name in a dropdown; a single kind with several shows
 * the dropdown alone. Renders nothing until an environment is picked or while
 * editing, where the agent stays where it is.
 */
export function TenantPicker({ errorFor = quiet }: TenantPickerProps = {}) {
  const {
    state,
    edit,
    fieldErrors,
    setTenantChoices,
    selectTenant,
    selectTenantKind,
  } = useNewAgentForm();
  const installation = edit ? undefined : state.installation;
  const { info, isLoading } = useAgentManagerInfo(installation);
  const managed = info?.namespaces?.managed;
  const choicesKey = managed?.join(',');

  useEffect(() => {
    if (choicesKey !== undefined) {
      setTenantChoices(choicesKey ? choicesKey.split(',') : []);
    }
  }, [choicesKey, setTenantChoices]);

  const { kinds, byKind } = tenantGroups(managed ?? []);
  const offersKind = kinds.length > 1;
  // The kind whose dropdown shows: the one chosen, or the only one.
  const dropdownKind = offersKind ? state.tenantKind : kinds[0];
  const dropdownChoices = dropdownKind ? byKind[dropdownKind] : [];
  const showsDropdown =
    Boolean(installation && managed && managed.length > 1) &&
    dropdownKind !== undefined &&
    dropdownKind !== 'platform';

  const kindError = useSelectFieldError(
    offersKind ? errorFor('tenant', fieldErrors.tenant) : undefined,
  );
  const pickError = useSelectFieldError(
    showsDropdown ? errorFor('tenantPick', fieldErrors.tenantPick) : undefined,
  );

  if (!installation) {
    return null;
  }

  const dropdown = showsDropdown ? (
    <>
      <Select
        aria-label={TENANT_KIND_LABELS[dropdownKind!]}
        isRequired
        searchable={searchableIf(dropdownChoices)}
        options={dropdownChoices.map(namespace => ({
          id: namespace,
          // Under Other namespace, the namespace's own name.
          label: dropdownKind === 'namespace' ? namespace : tenantOf(namespace),
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
        {...pickError.selectProps}
      />
      {pickError.message}
    </>
  ) : null;

  let body;
  if (isLoading && !managed) {
    body = <Text color="secondary">Reading where you may create agents…</Text>;
  } else if (!managed) {
    // agent-manager did not answer: the environment's own notes say why, and
    // the create call gets agent-manager's answer.
    return null;
  } else if (managed.length === 0) {
    body = (
      <Alert
        status="warning"
        title="You may not create agents here"
        description={`On ${installation}, you may create agents neither for the platform nor for an organization. ${ACCESS_GRANT_HINT}`}
      />
    );
  } else if (managed.length === 1) {
    body = (
      <Text>
        The agent belongs to <strong>{tenantInSentence(managed[0])}</strong>: on{' '}
        {installation}, you may create agents only there.
      </Text>
    );
  } else if (offersKind) {
    body = (
      <>
        <RadioGroup
          aria-label={KINDS_LABEL}
          isRequired
          value={state.tenantKind ?? null}
          onChange={value => selectTenantKind(value as TenantKind)}
          {...kindError.selectProps}
        >
          {kinds.map(kind => (
            <Radio key={kind} value={kind}>
              {TENANT_KIND_LABELS[kind]} — {KIND_EXPLANATIONS[kind]}
            </Radio>
          ))}
        </RadioGroup>
        {kindError.message}
        {dropdown}
      </>
    );
  } else {
    body = dropdown;
  }

  return (
    <Card>
      <CardBody>
        <SectionHeader
          variant="title-x-small"
          title={TITLE}
          description={DESCRIPTION}
        />
        <Flex direction="column" gap="2">
          {body}
        </Flex>
      </CardBody>
    </Card>
  );
}
