import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Alert,
  ButtonLink,
  Cell,
  CellText,
  type ColumnConfig,
  Flex,
  Table,
  Tag,
  TagGroup,
  Text,
} from '@backstage/ui';
import {
  EmptyStateCard,
  PageSection,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentManagerEgressPolicies } from '../../hooks/useAgentManagerEgressPolicies';
import { useAgentManagerModelConfigs } from '../../hooks/useAgentManagerModelConfigs';
import { useOrganizationConnectors } from '../../hooks/useOrganization';
import type {
  AgentManagerEgressPolicy,
  AgentManagerModelConfig,
} from '../../lib/agentManager';
import { organizationCredentialsRouteRef } from '../../routes';
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

/**
 * An organization's models, as agent-manager reads its ModelConfigs
 * (`list_model_configs`), with the default mark agent-manager resolves.
 * Every organization brings its own key: Add model and the empty state lead
 * to the Dev Portal's credential form for the organization, where a key is
 * entered and never shown back.
 */
export function ModelsTab({ installation, organization }: TabProps) {
  const models = useAgentManagerModelConfigs(
    installation,
    organization.namespace,
  );
  const credentialForm = useRouteRef(organizationCredentialsRouteRef)?.({
    installation,
    parent: organization.parent,
    name: organization.organization,
  });
  const addModel = credentialForm ? (
    <ButtonLink variant="secondary" href={credentialForm}>
      Add model
    </ButtonLink>
  ) : undefined;

  if (models.isLoading || models.failure) {
    return (
      <ReadState
        isLoading={models.isLoading}
        failure={models.failure}
        noun="models"
      />
    );
  }
  if (models.modelConfigs.length === 0) {
    return (
      <EmptyStateCard
        title="This organization has no model yet"
        description="Add a model with your own key to run agents. The key is entered once and never shown back."
        actions={addModel}
      />
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
  if (connectors.isLoading || connectors.failure) {
    return (
      <ReadState
        isLoading={connectors.isLoading}
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
  ];
  return (
    <PageSection
      title="Connectors"
      description="The MCP servers the organization's agents reach, each credential by its Secret's name, never its value."
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
