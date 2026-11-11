import { useRef, useState } from 'react';
import {
  Alert,
  Button,
  Cell,
  CellText,
  type ColumnConfig,
  Flex,
  Table,
  Tag,
  TagGroup,
  Text,
  TextField,
  Select,
} from '@backstage/ui';
import {
  ConfirmDialog,
  EmptyStateCard,
  PageSection,
  useFieldValidation,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentManagerEgressPolicies } from '../../hooks/useAgentManagerEgressPolicies';
import { useAgentManagerModelConfigs } from '../../hooks/useAgentManagerModelConfigs';
import { useOrganizationConnectors } from '../../hooks/useOrganization';
import { useOrganizationAccess } from '../../hooks/useOrganizationAccess';
import {
  type CredentialRequest,
  useOrganizationCredentialRequest,
} from '../../hooks/useOrganizationCredentialRequest';
import type {
  AgentManagerEgressPolicy,
  AgentManagerModelConfig,
} from '../../lib/agentManager';
import {
  LISTENER_PROVIDERS,
  MODEL_PROVIDER_OPTIONS,
} from '../../lib/modelConfigs';
import {
  type OrganizationConnector,
  type OrganizationNamespace,
} from '../../lib/organizations';

type TabProps = {
  installation: string;
  organization: OrganizationNamespace;
};

/** A read's state before its rows: reading, or why it could not be read. */
function ReadState({
  isLoading,
  failure,
  noun,
}: {
  isLoading: boolean;
  failure?: { message: string };
  noun: string;
}) {
  if (isLoading) {
    return <Text color="secondary">Reading the {noun}…</Text>;
  }
  if (failure) {
    return (
      <Alert
        status="warning"
        title={`Could not read the ${noun}`}
        description={failure.message}
      />
    );
  }
  return null;
}

type ModelRow = AgentManagerModelConfig & { id: string };

/** A Kubernetes object name, as a ModelConfig takes it. */
const NAME_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

/**
 * A new model of the organization: its name, provider and model id. The key
 * is not asked here: agent-manager prepares a credential request for it and
 * the next page, the credential form, takes it.
 */
function AddModelDialog({
  isOpen,
  onOpenChange,
  request,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  request: ReturnType<typeof useOrganizationCredentialRequest>;
}) {
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<string>(LISTENER_PROVIDERS[0]);
  const [model, setModel] = useState('');
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope, { isOpen });
  const trimmedName = name.trim();
  const trimmedModel = model.trim();
  let nameError: string | undefined;
  if (!trimmedName) {
    nameError = 'Enter a name for the model.';
  } else if (!NAME_PATTERN.test(trimmedName)) {
    nameError =
      'Lower-case letters, digits and dashes, starting and ending with a letter or a digit.';
  }
  const modelError = trimmedModel
    ? undefined
    : "Enter the provider's model id.";
  const close = (open: boolean) => {
    if (!open) {
      setName('');
      setModel('');
      setProvider(LISTENER_PROVIDERS[0]);
    }
    onOpenChange(open);
  };
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={close}
      title="Add a model"
      confirmLabel="Continue to the key"
      busyLabel="Preparing…"
      isBusy={request.isPending}
      error={request.error?.message}
      onConfirm={() => {
        if (nameError || modelError) {
          validation.reveal();
          return;
        }
        request.mutate({
          kind: 'model',
          name: trimmedName,
          provider,
          model: trimmedModel,
        });
      }}
    >
      <Flex direction="column" gap="3" ref={scope}>
        <TextField
          label="Name"
          description="The model's name in the organization, e.g. claude-sonnet."
          isRequired
          value={name}
          onChange={setName}
          {...validation.textFieldProps('name', nameError)}
        />
        <Select
          label="Provider"
          selectedKey={provider}
          options={LISTENER_PROVIDERS.map(id => ({
            id,
            label:
              MODEL_PROVIDER_OPTIONS.find(option => option.id === id)?.label ??
              id,
          }))}
          onSelectionChange={key => key && setProvider(String(key))}
        />
        <TextField
          label="Model"
          description="The provider's model id, e.g. claude-sonnet-4-6."
          isRequired
          value={model}
          onChange={setModel}
          {...validation.textFieldProps('model', modelError)}
        />
        <Text color="secondary">
          You enter the organization's key for it on the next page. It is never
          shown back.
        </Text>
      </Flex>
    </ConfirmDialog>
  );
}

/**
 * Asks before a new key or credential value is requested for an existing
 * object: the current one stays until the new one is saved on the form.
 */
function ReplaceCredentialDialog({
  target,
  onClose,
  request,
}: {
  target?: { label: string; request: CredentialRequest };
  onClose: () => void;
  request: ReturnType<typeof useOrganizationCredentialRequest>;
}) {
  return (
    <ConfirmDialog
      isOpen={target !== undefined}
      onOpenChange={open => !open && onClose()}
      title={target ? `Replace the credential of ${target.label}?` : ''}
      confirmLabel="Continue"
      busyLabel="Preparing…"
      isBusy={request.isPending}
      error={request.error?.message}
      onConfirm={() => target && request.mutate(target.request)}
    >
      <Text>
        You enter the new value on the next page. The current one stays in use
        until you save it there.
      </Text>
    </ConfirmDialog>
  );
}

/**
 * An organization's models, as agent-manager reads its ModelConfigs
 * (`list_model_configs`), with the default mark agent-manager resolves.
 * Every organization brings its own key: Add model asks agent-manager for
 * the model, which prepares a credential request, and the person enters the
 * key on the Dev Portal's credential form, where it is never shown back.
 */
export function ModelsTab({ installation, organization }: TabProps) {
  const models = useAgentManagerModelConfigs(
    installation,
    organization.namespace,
  );
  const request = useOrganizationCredentialRequest(installation, organization);
  const access = useOrganizationAccess(installation, organization.namespace);
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<{
    label: string;
    request: CredentialRequest;
  }>();
  const dialogs = (
    <>
      <AddModelDialog
        isOpen={adding}
        onOpenChange={open => {
          setAdding(open);
          request.reset();
        }}
        request={request}
      />
      <ReplaceCredentialDialog
        target={replacing}
        onClose={() => {
          setReplacing(undefined);
          request.reset();
        }}
        request={request}
      />
    </>
  );
  const addModel = access.models ? (
    <Button variant="secondary" onPress={() => setAdding(true)}>
      Add model
    </Button>
  ) : undefined;

  if (models.isLoading || access.isLoading || models.failure) {
    return (
      <ReadState
        isLoading={models.isLoading || access.isLoading}
        failure={models.failure}
        noun="models"
      />
    );
  }
  if (models.modelConfigs.length === 0) {
    return (
      <>
        <EmptyStateCard
          title="This organization has no model yet"
          description={
            access.models
              ? 'Add a model with your own key to run agents. The key is entered once and never shown back.'
              : 'An admin of the organization adds a model with its own key to run agents.'
          }
          actions={addModel}
        />
        {dialogs}
      </>
    );
  }

  const columns: ColumnConfig<ModelRow>[] = [
    {
      id: 'name',
      label: 'Name',
      isRowHeader: true,
      defaultWidth: '2fr',
      cell: row => <CellText title={row.name} />,
    },
    {
      id: 'model',
      label: 'Model',
      defaultWidth: '2fr',
      cell: row => (
        <CellText
          title={row.model ?? '—'}
          description={row.provider ?? undefined}
        />
      ),
    },
    {
      id: 'default',
      label: 'Default',
      defaultWidth: '1fr',
      cell: row => (
        <Cell>
          {row.default ? (
            <TagGroup aria-label={`${row.name} marks`}>
              <Tag id="default">Default</Tag>
            </TagGroup>
          ) : null}
        </Cell>
      ),
    },
    {
      id: 'accepted',
      label: 'Accepted',
      defaultWidth: '2fr',
      cell: row => {
        let title = 'Unknown';
        if (row.accepted === true) {
          title = 'Yes';
        } else if (row.accepted === false) {
          title = 'No';
        }
        return <CellText title={title} description={row.message} />;
      },
    },
    {
      id: 'key',
      label: 'Key',
      defaultWidth: '1fr',
      cell: row => (
        <Cell>
          {access.credentials ? (
            <Button
              variant="tertiary"
              size="small"
              aria-label={`Replace the key of ${row.name}`}
              onPress={() =>
                setReplacing({
                  label: row.name,
                  request: { kind: 'model-key', name: row.name },
                })
              }
            >
              Replace key
            </Button>
          ) : null}
        </Cell>
      ),
    },
  ];
  const hasDefault = models.modelConfigs.some(model => model.default);

  return (
    <PageSection
      title="Models"
      description="The models the organization's agents run on, each with the organization's own key."
      action={addModel}
    >
      <Flex direction="column" gap="3">
        {!hasDefault && (
          <Alert
            status="warning"
            title="No default model"
            description="The organization's curated agents run on its default model. An admin marks one as the default."
          />
        )}
        <Table<ModelRow>
          columnConfig={columns}
          data={models.modelConfigs.map(model => ({
            ...model,
            id: model.name,
          }))}
          pagination={{ type: 'none' }}
        />
      </Flex>
      {dialogs}
    </PageSection>
  );
}

type ConnectorRow = OrganizationConnector & { id: string };

/** An organization's connectors, its RemoteMCPServers. */
export function ConnectorsTab({ installation, organization }: TabProps) {
  const connectors = useOrganizationConnectors(
    installation,
    organization.namespace,
  );
  const request = useOrganizationCredentialRequest(installation, organization);
  const access = useOrganizationAccess(installation, organization.namespace);
  const [replacing, setReplacing] = useState<{
    label: string;
    request: CredentialRequest;
  }>();
  if (connectors.isLoading || access.isLoading || connectors.failure) {
    return (
      <ReadState
        isLoading={connectors.isLoading || access.isLoading}
        failure={connectors.failure}
        noun="connectors"
      />
    );
  }
  const rows = connectors.data ?? [];
  const columns: ColumnConfig<ConnectorRow>[] = [
    {
      id: 'name',
      label: 'Name',
      isRowHeader: true,
      defaultWidth: '2fr',
      cell: row => (
        <CellText
          title={row.name}
          description={row.curated ? 'curated by the platform' : undefined}
        />
      ),
    },
    {
      id: 'url',
      label: 'URL',
      defaultWidth: '3fr',
      cell: row => <CellText title={row.url} description={row.description} />,
    },
    {
      id: 'credentials',
      label: 'Credentials',
      defaultWidth: '2fr',
      cell: row => (
        <CellText
          title={
            row.credentials.length === 0
              ? 'None'
              : row.credentials
                  .map(
                    credential => `${credential.header} ← ${credential.secret}`,
                  )
                  .join(', ')
          }
        />
      ),
    },
    {
      id: 'replace',
      label: '',
      defaultWidth: '1fr',
      cell: row => (
        <Cell>
          {access.credentials && row.credentials.length > 0 && !row.curated ? (
            <Button
              variant="tertiary"
              size="small"
              aria-label={`Replace the credential of ${row.name}`}
              onPress={() =>
                setReplacing({
                  label: row.name,
                  request: { kind: 'connector-credential', name: row.name },
                })
              }
            >
              Replace credential
            </Button>
          ) : null}
        </Cell>
      ),
    },
  ];
  return (
    <PageSection
      title="Connectors"
      description="The connectors the organization's agents reach, each credential by its Secret's name, never its value."
    >
      {rows.length === 0 ? (
        <Text color="secondary">
          The organization has no connector of its own.
        </Text>
      ) : (
        <Table<ConnectorRow>
          columnConfig={columns}
          data={rows.map(row => ({ ...row, id: row.name }))}
          pagination={{ type: 'none' }}
        />
      )}
      <ReplaceCredentialDialog
        target={replacing}
        onClose={() => {
          setReplacing(undefined);
          request.reset();
        }}
        request={request}
      />
    </PageSection>
  );
}

type EgressRow = AgentManagerEgressPolicy & { id: string };

/** An organization's egress policies: the origins its agents may reach. */
export function EgressTab({ installation, organization }: TabProps) {
  const policies = useAgentManagerEgressPolicies(
    installation,
    organization.namespace,
  );
  if (policies.isLoading || policies.failure) {
    return (
      <ReadState
        isLoading={policies.isLoading}
        failure={policies.failure}
        noun="egress policies"
      />
    );
  }
  const columns: ColumnConfig<EgressRow>[] = [
    {
      id: 'name',
      label: 'Name',
      isRowHeader: true,
      defaultWidth: '1fr',
      cell: row => <CellText title={row.name} />,
    },
    {
      id: 'origins',
      label: 'Origins',
      defaultWidth: '3fr',
      cell: row => (
        <CellText
          title={row.destinations
            .map(destination =>
              destination.credentialHeader
                ? `${destination.origin} (adds ${destination.credentialHeader})`
                : destination.origin,
            )
            .join(', ')}
        />
      ),
    },
  ];
  return (
    <PageSection
      title="Egress"
      description="The origins the organization's agents may reach besides their own, and the credential header the egress gateway adds."
    >
      {policies.egressPolicies.length === 0 ? (
        <Text color="secondary">The organization has no egress policy.</Text>
      ) : (
        <Table<EgressRow>
          columnConfig={columns}
          data={policies.egressPolicies.map(policy => ({
            ...policy,
            id: policy.name,
          }))}
          pagination={{ type: 'none' }}
        />
      )}
    </PageSection>
  );
}
