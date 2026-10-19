import { useEffect } from 'react';
import { Alert, Card, CardBody, Flex, Select, Text } from '@backstage/ui';
import {
  searchableIf,
  SectionHeader,
  useSelectFieldError,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import { ACCESS_GRANT_HINT, tenantOf } from '../../lib/tenants';
import { useNewAgentForm } from '../NewAgentFormProvider';

const DESCRIPTION =
  'The team the agent belongs to: its people can use it, and its editors can change it.';

export type TenantPickerProps = {
  /** The field's validation problem, shown under it once the form wants it seen. */
  error?: string;
};

/**
 * Where a new agent is created: one of the tenants on the picked environment
 * in which the person may create agents, as agent-manager answers it for them
 * (`get_info`'s `namespaces.managed`, checked per namespace with a
 * `SelfSubjectAccessReview`). Never a namespace typed by hand. The only
 * tenant is picked and named rather than offered; with several, the platform
 * tenant is picked when it is one of them. Renders nothing until an
 * environment is picked or while editing, where the agent stays in its
 * tenant.
 */
export function TenantPicker({ error }: TenantPickerProps = {}) {
  const { state, edit, setTenantChoices, selectTenant } = useNewAgentForm();
  const selectError = useSelectFieldError(error);
  const installation = edit ? undefined : state.installation;
  const { info, isLoading } = useAgentManagerInfo(installation);
  const managed = info?.namespaces?.managed;
  const choicesKey = managed?.join(',');

  useEffect(() => {
    if (choicesKey !== undefined) {
      setTenantChoices(choicesKey ? choicesKey.split(',') : []);
    }
  }, [choicesKey, setTenantChoices]);

  if (!installation) {
    return null;
  }

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
        description={`You may create agents in no tenant on ${installation}. ${ACCESS_GRANT_HINT}`}
      />
    );
  } else if (managed.length === 1) {
    body = (
      <Text>
        Created in <strong>{tenantOf(managed[0])}</strong>, the only tenant you
        may create agents in on {installation}.
      </Text>
    );
  } else {
    body = (
      <>
        <Select
          aria-label="Tenant"
          isRequired
          searchable={searchableIf(managed)}
          options={managed.map(namespace => ({
            id: namespace,
            label: tenantOf(namespace),
          }))}
          selectedKey={state.tenant ?? null}
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
  }

  return (
    <Card>
      <CardBody>
        <SectionHeader
          variant="title-x-small"
          title="Tenant"
          description={DESCRIPTION}
        />
        <Flex direction="column" gap="2">
          {body}
        </Flex>
      </CardBody>
    </Card>
  );
}
