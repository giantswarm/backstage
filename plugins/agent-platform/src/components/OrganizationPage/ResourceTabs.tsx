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
  tableRowId,
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
import { credentialRequestErrorMessage } from '../../lib/credentialRequestErrors';
import type {
  AgentManagerEgressPolicy,
  AgentManagerModelConfig,
} from '../../lib/agentManager';
import {
  LISTENER_PROVIDERS,
  MODEL_PROVIDER_OPTIONS,
  modelNameError,
} from '../../lib/modelConfigs';
import { slugify } from '../../lib/slugify';
import {
  INITIAL_MODEL_SETTINGS,
  modelSettingsSummary,
  type ModelSettingsValues,
} from '../../lib/modelSettings';
import { useModelSettingsSupport } from '../../hooks/useModelSettingsSupport';
import { ModelSettingsFields } from '../ModelConfigForm';
import {
  type OrganizationConnector,
  type OrganizationNamespace,
} from '../../lib/organizations';

type TabProps = {
  installation: string;
  organization: OrganizationNamespace;
};

/**
 * A tab that writes: with `changesDisabledBy` (the id of the line that says
 * why, on Pending erase and while Erasing) its rows stay listed and every
 * change is off.
 */
type WritingTabProps = TabProps & { changesDisabledBy?: string };

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

/**
 * A new model of the organization: its name, provider and model id, and,
 * where the installation's agent-manager takes them, its settings (a new
 * Anthropic model caches its prompts). The
 * technical name is filled in from the name. The key
 * is not asked here: agent-manager prepares a credential request for it and
 * the next page, the credential form, takes it.
 */
function AddModelDialog({
  isOpen,
  onOpenChange,
  request,
  settings,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  request: ReturnType<typeof useOrganizationCredentialRequest>;
  /** Whether to offer the model's settings. */
  settings: boolean;
}) {
  const [name, setName] = useState('');
  const [settingsValues, setSettingsValues] = useState<ModelSettingsValues>(
    INITIAL_MODEL_SETTINGS,
  );
  const [provider, setProvider] = useState<string>(LISTENER_PROVIDERS[0]);
  const [model, setModel] = useState('');
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope, { isOpen });
  const displayName = name.trim();
  const technicalName = slugify(displayName);
  const trimmedModel = model.trim();
  // The dialog has no technical name field: a name it cannot be made from is
  // refused in terms of the name.
  let nameError: string | undefined;
  if (!displayName) {
    nameError = 'Enter a name for the model.';
  } else if (!technicalName) {
    nameError =
      'Use at least one letter a–z or digit in the name: the model’s technical name is made from them.';
  } else {
    nameError = modelNameError(technicalName);
  }
  const modelError = trimmedModel
    ? undefined
    : "Enter the provider's model id.";
  const close = (open: boolean) => {
    if (!open) {
      setName('');
      setModel('');
      setProvider(LISTENER_PROVIDERS[0]);
      setSettingsValues(INITIAL_MODEL_SETTINGS);
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
        request.mutate(
          {
            kind: 'model',
            name: technicalName,
            displayName,
            provider,
            model: trimmedModel,
            ...(settings ? { settings: settingsValues } : {}),
          },
          {
            onSuccess: ({ form }) => {
              if (!form) close(false);
            },
          },
        );
      }}
    >
      <Flex direction="column" gap="3" ref={scope}>
        <TextField
          label="Name"
          description={
            technicalName
              ? `People creating agents see the model under this name. Its technical name is ${technicalName}; it cannot be changed once the model exists.`
              : 'People creating agents see the model under this name, e.g. Claude Sonnet.'
          }
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
        {settings && (
          <ModelSettingsFields
            provider={provider}
            values={settingsValues}
            onChange={patch =>
              setSettingsValues(previous => ({ ...previous, ...patch }))
            }
            framed={false}
          />
        )}
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
      error={
        request.error ? credentialRequestErrorMessage(request.error) : undefined
      }
      onConfirm={() =>
        target &&
        request.mutate(target.request, {
          onSuccess: ({ form }) => {
            if (!form) onClose();
          },
        })
      }
    >
      <Text>
        You enter the new value on the next page, which lists every object that
        uses this credential and where each sends it. The current value stays in
        use until you save the new one there.
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
export function ModelsTab({
  installation,
  organization,
  changesDisabledBy,
}: WritingTabProps) {
  const off = changesDisabledBy !== undefined;
  const models = useAgentManagerModelConfigs(
    installation,
    organization.namespace,
  );
  const request = useOrganizationCredentialRequest(installation, organization);
  const access = useOrganizationAccess(installation, organization.namespace);
  // The settings show where the installation's agent-manager takes and
  // reports them; an older one reports none.
  const settings = useModelSettingsSupport(installation) === true;
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<{
    label: string;
    request: CredentialRequest;
  }>();
  // A dialog open when the changes turn off closes: its confirm would write.
  const dialogs = (
    <>
      <AddModelDialog
        isOpen={adding && !off}
        onOpenChange={open => {
          setAdding(open);
          request.reset();
        }}
        request={request}
        settings={settings}
      />
      <ReplaceCredentialDialog
        target={off ? undefined : replacing}
        onClose={() => {
          setReplacing(undefined);
          request.reset();
        }}
        request={request}
      />
    </>
  );
  const addModel = access.models ? (
    <Button
      variant="secondary"
      isDisabled={off}
      aria-describedby={changesDisabledBy}
      onPress={() => setAdding(true)}
    >
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
    // With the changes off no model is added any more; the status alert
    // above says why.
    let emptyDescription: string | undefined;
    if (!off) {
      emptyDescription = access.models
        ? 'Add a model with your own key to run agents. The key is entered once and never shown back.'
        : 'An admin of the organization adds a model with its own key to run agents.';
    }
    return (
      <>
        <EmptyStateCard
          title="This organization has no model yet"
          description={emptyDescription}
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
      cell: row => (
        <CellText
          title={row.displayName || row.name}
          description={row.displayName ? row.name : undefined}
        />
      ),
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
    ...(settings
      ? [
          {
            id: 'settings',
            label: 'Settings',
            defaultWidth: '2fr',
            cell: (row: ModelRow) => {
              const summary = modelSettingsSummary(row);
              return (
                <CellText
                  title={summary?.tokens ?? summary?.caching ?? '—'}
                  description={summary?.tokens ? summary.caching : undefined}
                />
              );
            },
          } satisfies ColumnConfig<ModelRow>,
        ]
      : []),
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
          {access.credentials && !row.managedBy ? (
            <Button
              variant="tertiary"
              size="small"
              aria-label={`Replace the key of ${row.name}`}
              isDisabled={off}
              aria-describedby={changesDisabledBy}
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
            id: tableRowId('model', model.name),
          }))}
          pagination={{ type: 'none' }}
        />
      </Flex>
      {dialogs}
    </PageSection>
  );
}

type ConnectorRow = OrganizationConnector & { id: string };

/**
 * A connector's credential Secrets and keys, once each, with the headers
 * that send each: several headers may read the same pair.
 */
function credentialPairsOf(
  connector: OrganizationConnector,
): { secret: string; key: string; headers: string[] }[] {
  const pairs = new Map<
    string,
    { secret: string; key: string; headers: string[] }
  >();
  for (const credential of connector.credentials) {
    const id = `${credential.secret}/${credential.key}`;
    const pair = pairs.get(id) ?? {
      secret: credential.secret,
      key: credential.key,
      headers: [],
    };
    pair.headers.push(credential.header);
    pairs.set(id, pair);
  }
  return [...pairs.values()];
}

/** An organization's connectors, its RemoteMCPServers. */
export function ConnectorsTab({
  installation,
  organization,
  changesDisabledBy,
}: WritingTabProps) {
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
      cell: row => {
        if (!access.credentials || row.curated) {
          return <Cell />;
        }
        // One Replace per Secret and key: a rotation writes that Secret
        // only, for every object that reads it; the connector is not sent.
        const pairs = credentialPairsOf(row);
        return (
          <Cell>
            <Flex gap="1" style={{ flexWrap: 'wrap' }}>
              {pairs.map(pair => {
                const what =
                  pairs.length === 1
                    ? row.name
                    : `${row.name} (${pair.headers.join(', ')})`;
                return (
                  <Button
                    key={`${pair.secret}/${pair.key}`}
                    variant="tertiary"
                    size="small"
                    aria-label={`Replace the credential of ${what}`}
                    isDisabled={changesDisabledBy !== undefined}
                    aria-describedby={changesDisabledBy}
                    onPress={() =>
                      setReplacing({
                        label: what,
                        request: {
                          kind: 'credential',
                          secret: pair.secret,
                          key: pair.key,
                        },
                      })
                    }
                  >
                    {pairs.length === 1
                      ? 'Replace credential'
                      : `Replace ${pair.headers.join(', ')}`}
                  </Button>
                );
              })}
            </Flex>
          </Cell>
        );
      },
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
          data={rows.map(row => ({
            ...row,
            id: tableRowId('connector', row.name),
          }))}
          pagination={{ type: 'none' }}
        />
      )}
      <ReplaceCredentialDialog
        // Closed when the changes turn off: its confirm would write.
        target={changesDisabledBy === undefined ? replacing : undefined}
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

/**
 * An egress policy's credential Secrets and keys, once each, with the
 * headers and origins that send each: several destinations may read the same
 * pair. A destination that names no Secret and key (none, or an
 * agent-manager older than giantswarm/agent-manager#371) gives none.
 */
function egressCredentialPairsOf(
  policy: AgentManagerEgressPolicy,
): { secret: string; key: string; headers: string[]; origins: string[] }[] {
  const pairs = new Map<
    string,
    { secret: string; key: string; headers: string[]; origins: string[] }
  >();
  for (const destination of policy.destinations) {
    const { credentialSecret: secret, credentialKey: key } = destination;
    if (!secret || !key) {
      continue;
    }
    const id = `${secret}/${key}`;
    const pair = pairs.get(id) ?? { secret, key, headers: [], origins: [] };
    if (
      destination.credentialHeader &&
      !pair.headers.includes(destination.credentialHeader)
    ) {
      pair.headers.push(destination.credentialHeader);
    }
    pair.origins.push(destination.origin);
    pairs.set(id, pair);
  }
  return [...pairs.values()];
}

/**
 * What tells a policy's pairs apart: their headers, as on the Connectors
 * tab, or their origins when two pairs have the same headers.
 */
function egressPairNames(
  pairs: ReturnType<typeof egressCredentialPairsOf>,
): string[] {
  const byHeaders = pairs.map(pair => pair.headers.join(', '));
  return byHeaders.every(
    (name, index) => name && byHeaders.indexOf(name) === index,
  )
    ? byHeaders
    : pairs.map(pair => pair.origins.join(', '));
}

/** An organization's egress policies: the origins its agents may reach. */
export function EgressTab({
  installation,
  organization,
  changesDisabledBy,
}: WritingTabProps) {
  const policies = useAgentManagerEgressPolicies(
    installation,
    organization.namespace,
  );
  const request = useOrganizationCredentialRequest(installation, organization);
  const access = useOrganizationAccess(installation, organization.namespace);
  const [replacing, setReplacing] = useState<{
    label: string;
    request: CredentialRequest;
  }>();
  if (policies.isLoading || access.isLoading || policies.failure) {
    return (
      <ReadState
        isLoading={policies.isLoading || access.isLoading}
        failure={policies.failure}
        noun="egress policies"
      />
    );
  }
  // One Replace per Secret and key: a rotation writes that Secret only, for
  // every object that reads it; the policy and its destinations are not
  // sent. `managedBy` (app.kubernetes.io/managed-by, Helm for one) does not
  // say the platform owns the policy: agent-manager refuses a copy the
  // platform curates, and the dialog says why.
  const replaceable = (row: AgentManagerEgressPolicy) =>
    access.credentials ? egressCredentialPairsOf(row) : [];
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
  // Without a credential to replace, the tab stays as it was: no empty
  // column.
  if (policies.egressPolicies.some(row => replaceable(row).length > 0)) {
    columns.push({
      id: 'replace',
      label: '',
      defaultWidth: '1fr',
      // The button's whole label, on a phone too.
      minWidth: 160,
      cell: row => {
        const pairs = replaceable(row);
        const names = egressPairNames(pairs);
        return (
          <Cell>
            <Flex gap="1" style={{ flexWrap: 'wrap' }}>
              {pairs.map((pair, index) => {
                const what =
                  pairs.length === 1
                    ? row.name
                    : `${row.name} (${names[index]})`;
                return (
                  <Button
                    key={`${pair.secret}/${pair.key}`}
                    variant="tertiary"
                    size="small"
                    aria-label={`Replace the credential of ${what}`}
                    isDisabled={changesDisabledBy !== undefined}
                    aria-describedby={changesDisabledBy}
                    onPress={() =>
                      setReplacing({
                        label: what,
                        request: {
                          kind: 'credential',
                          secret: pair.secret,
                          key: pair.key,
                        },
                      })
                    }
                  >
                    {pairs.length === 1
                      ? 'Replace credential'
                      : `Replace ${names[index]}`}
                  </Button>
                );
              })}
            </Flex>
          </Cell>
        );
      },
    });
  }
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
            id: tableRowId('egress-policy', policy.name),
          }))}
          pagination={{ type: 'none' }}
        />
      )}
      <ReplaceCredentialDialog
        // Closed when the changes turn off: its confirm would write.
        target={changesDisabledBy === undefined ? replacing : undefined}
        onClose={() => {
          setReplacing(undefined);
          request.reset();
        }}
        request={request}
      />
    </PageSection>
  );
}
