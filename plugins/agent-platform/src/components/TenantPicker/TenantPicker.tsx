import { useEffect, useState } from 'react';
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
  organizationOf,
  PLATFORM_TENANT_NAMESPACE,
  tenantInSentence,
  tenantOf,
} from '../../lib/tenants';
import { useNewAgentForm } from '../NewAgentFormProvider';

const TITLE = 'Organization';

const DESCRIPTION = 'Who can use the agent, and whose editors can change it.';

/** The dropdown's problem once Organization is chosen and none picked. */
const NO_ORGANIZATION = 'Choose an organization.';

type Kind = 'platform' | 'organization';

export type TenantPickerProps = {
  /** The field's validation problem, shown under it once the form wants it seen. */
  error?: string;
};

/**
 * Where a new agent is created: the platform or one of the organizations on
 * the picked environment in which the person may create agents, as
 * agent-manager answers it for them (`get_info`'s `namespaces.managed`,
 * checked per namespace with a `SelfSubjectAccessReview`). Never a namespace
 * typed by hand. The only one is picked and named rather than offered; where
 * the platform is one of several, the person chooses Platform or
 * Organization, and Organization offers the organizations by name. Renders
 * nothing until an environment is picked or while editing, where the agent
 * stays where it is.
 */
export function TenantPicker({ error }: TenantPickerProps = {}) {
  const { state, edit, setTenantChoices, selectTenant } = useNewAgentForm();
  const installation = edit ? undefined : state.installation;
  const { info, isLoading } = useAgentManagerInfo(installation);
  const managed = info?.namespaces?.managed;
  const choicesKey = managed?.join(',');
  // Organization chosen before an organization is picked: the form holds no
  // tenant yet, so the choice is kept here.
  const [kind, setKind] = useState<Kind>();

  useEffect(() => {
    if (choicesKey !== undefined) {
      setTenantChoices(choicesKey ? choicesKey.split(',') : []);
    }
  }, [choicesKey, setTenantChoices]);

  let picked: Kind | undefined;
  if (state.tenant !== undefined) {
    picked =
      state.tenant === PLATFORM_TENANT_NAMESPACE ? 'platform' : 'organization';
  } else if (kind === 'organization') {
    picked = kind;
  }
  const hasPlatform = managed?.includes(PLATFORM_TENANT_NAMESPACE) ?? false;
  const organizations =
    managed?.filter(namespace => namespace !== PLATFORM_TENANT_NAMESPACE) ?? [];
  const offersKind = hasPlatform && organizations.length > 0;

  const kindError = useSelectFieldError(
    offersKind && !picked ? error : undefined,
  );
  const selectError = useSelectFieldError(
    error && (!offersKind || picked === 'organization')
      ? NO_ORGANIZATION
      : undefined,
  );

  if (!installation) {
    return null;
  }

  const organizationSelect = (
    <>
      <Select
        aria-label={TITLE}
        isRequired
        searchable={searchableIf(organizations)}
        options={organizations.map(namespace => ({
          id: namespace,
          label: organizationOf(namespace) ?? tenantOf(namespace),
        }))}
        selectedKey={
          state.tenant && state.tenant !== PLATFORM_TENANT_NAMESPACE
            ? state.tenant
            : null
        }
        onSelectionChange={key => {
          if (key) {
            selectTenant(String(key));
          }
        }}
        {...selectError.selectProps}
      />
      {selectError.message}
    </>
  );

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
          aria-label="Platform or organization"
          isRequired
          value={picked ?? null}
          onChange={value => {
            setKind(value as Kind);
            if (value === 'platform') {
              selectTenant(PLATFORM_TENANT_NAMESPACE);
            } else if (organizations.length === 1) {
              selectTenant(organizations[0]);
            } else if (state.tenant === PLATFORM_TENANT_NAMESPACE) {
              selectTenant(undefined);
            }
          }}
          {...kindError.selectProps}
        >
          <Radio value="platform">
            Platform — the platform’s agents, for everyone
          </Radio>
          <Radio value="organization">
            Organization — one organization’s agents, for its people
          </Radio>
        </RadioGroup>
        {kindError.message}
        {picked === 'organization' && organizationSelect}
      </>
    );
  } else {
    body = organizationSelect;
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
