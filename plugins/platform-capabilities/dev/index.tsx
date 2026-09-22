import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
// The dev app is the app: the plugin's @backstage/ui controls need the
// package's stylesheet, which packages/app imports; the rule guards the
// published plugin bundle, and dev/ is not part of it.
// eslint-disable-next-line @backstage/no-ui-css-imports-in-non-frontend
import '@backstage/ui/css/styles.css';
import { ConfigReader } from '@backstage/config';
import {
  Content,
  Header,
  Page,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { IdentityApi, SignInPageProps } from '@backstage/core-plugin-api';
import { createApp } from '@backstage/frontend-defaults';
import {
  ApiBlueprint,
  createFrontendModule,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import { platformCapabilitiesApiRef } from '../src/apis';
import { useInstallationCapabilityColumns } from '../src/components/columns';
import {
  AGENT_PLATFORM_DEFINITION,
  DRIFTED,
  ENABLED,
  ENABLED_BY_HAND,
  FAILED,
  FakeApi,
  installation,
  NOT_ENABLED,
  ROLLING_OUT,
} from '../src/fixtures/fakeApi';
import { platformCapabilitiesPlugin } from '../src/plugin';

/**
 * The Installations table's capability columns over the fixture
 * installations, without a manager or a catalog: `yarn start` in this
 * package serves it at http://localhost:3000. One row per state the manager
 * reports, so every icon of the column is on one screen.
 */
const INSTALLATIONS = [
  ENABLED,
  ENABLED_BY_HAND,
  DRIFTED,
  ROLLING_OUT,
  FAILED,
  installation(),
  NOT_ENABLED,
];

const fakeApi = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: platformCapabilitiesApiRef,
      deps: {},
      factory: () =>
        new FakeApi({
          // Both capabilities in the same state on each installation, so
          // every column has every icon.
          installations: INSTALLATIONS.map(i => ({
            ...i,
            capabilities: [
              ...i.capabilities,
              { ...i.capabilities[0], name: 'customer-portal' },
            ],
          })),
          unreadable: ['juniper'],
          definitions: [
            AGENT_PLATFORM_DEFINITION,
            { ...AGENT_PLATFORM_DEFINITION, name: 'customer-portal' },
          ],
          // The manager answers `get_info` through the backend and muster
          // in a second or two, and reads the fleet's repositories for the
          // listing: the columns are the plugin's own first, skeletons for a
          // while, as on the real page.
          infoLatency: 1500,
          latency: 4000,
        }),
    }),
});

/** A row as the catalog's table holds an installation, with the facts its columns show. */
const row = (name: string, customer: string, region = 'eu-central-1') =>
  ({
    entity: {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: {
        name,
        labels: {
          'giantswarm.io/customer': customer,
          'giantswarm.io/provider': 'capa',
          'giantswarm.io/pipeline': 'stable-testing',
          'giantswarm.io/region': region,
        },
      },
      spec: { type: 'installation', owner: customer },
    },
    resolved: { name },
  }) as unknown as CatalogTableRow;

const ROWS = [
  ...INSTALLATIONS.map(i => row(i.name, i.customer ?? '', 'cn-northwest-1')),
  row('juniper', 'example'),
  row('willow', 'example', 'ap-southeast-1'),
];

/** The page's cells keep to one line, cut with an ellipsis. */
const noWrap = {
  overflow: 'hidden',
  whiteSpace: 'nowrap' as const,
  textOverflow: 'ellipsis',
};

/**
 * The Installations page's own columns (plugins/gs InstallationsPage), so the
 * capability columns are seen next to what they share the table with: every
 * base column is `auto`, sized by the browser from its content.
 */
const BASE_COLUMNS: TableColumn<CatalogTableRow>[] = [
  {
    title: 'Name',
    field: 'entity.metadata.name',
    highlight: true,
    width: 'auto',
  },
  {
    title: 'Customer',
    field: 'entity.metadata.labels.giantswarm.io/customer',
    width: 'auto',
    cellStyle: noWrap,
    render: r => r.entity.metadata.labels?.['giantswarm.io/customer'],
  },
  {
    title: 'Provider',
    field: 'entity.metadata.labels.giantswarm.io/provider',
    width: 'auto',
    cellStyle: noWrap,
    render: r => r.entity.metadata.labels?.['giantswarm.io/provider'],
  },
  {
    title: 'Pipeline',
    field: 'entity.metadata.labels.giantswarm.io/pipeline',
    width: 'auto',
    cellStyle: noWrap,
    render: r => r.entity.metadata.labels?.['giantswarm.io/pipeline'],
  },
  {
    title: 'Region',
    field: 'entity.metadata.labels.giantswarm.io/region',
    width: 'auto',
    cellStyle: noWrap,
    render: r => r.entity.metadata.labels?.['giantswarm.io/region'],
  },
];

function InstallationsDevPage() {
  const { columns, notice } = useInstallationCapabilityColumns();
  return (
    <Page themeId="tool">
      <Header title="Installations (dev)" />
      <Content>
        {notice}
        <Table<CatalogTableRow>
          title={`All installation Resources (${ROWS.length})`}
          options={{
            padding: 'dense',
            paging: false,
            search: false,
            actionsColumnIndex: -1,
          }}
          columns={[...BASE_COLUMNS, ...columns]}
          data={ROWS}
          actions={[
            {
              icon: () => <span>☆</span>,
              tooltip: 'Add to favorites',
              onClick: () => {},
            },
          ]}
        />
      </Content>
    </Page>
  );
}

const devPage = PageBlueprint.make({
  params: {
    path: '/',
    loader: async () => <InstallationsDevPage />,
  },
});

/** The fixtures' caller, signed in without an auth backend. */
const alice: IdentityApi = {
  getProfileInfo: async () => ({
    displayName: 'Alice',
    email: 'alice@example.com',
  }),
  getBackstageIdentity: async () => ({
    type: 'user',
    userEntityRef: 'user:default/alice',
    ownershipEntityRefs: ['user:default/alice'],
  }),
  getCredentials: async () => ({}),
  signOut: async () => {},
};

function SignInAsAlice({ onSignInSuccess }: SignInPageProps) {
  useEffect(() => onSignInSuccess(alice), [onSignInSuccess]);
  return null;
}

const signIn = SignInPageBlueprint.make({
  params: { loader: async () => SignInAsAlice },
});

const app = createApp({
  features: [
    platformCapabilitiesPlugin,
    createFrontendModule({
      pluginId: 'platform-capabilities',
      extensions: [fakeApi, devPage],
    }),
    createFrontendModule({ pluginId: 'app', extensions: [signIn] }),
  ],
  advanced: {
    configLoader: async () => ({
      config: new ConfigReader({
        app: {
          title: 'Platform capabilities (dev)',
          baseUrl: 'http://localhost:3000',
          extensions: ['api:platform-capabilities'],
        },
        backend: { baseUrl: 'http://localhost:7007' },
      }),
    }),
  },
});

createRoot(document.getElementById('root')!).render(app.createRoot());
