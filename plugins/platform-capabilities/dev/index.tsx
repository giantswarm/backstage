import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
// The dev app is the app: the plugin's @backstage/ui controls need the
// package's stylesheet, which packages/app imports; the rule guards the
// published plugin bundle, and dev/ is not part of it.
// eslint-disable-next-line @backstage/no-ui-css-imports-in-non-frontend
import '@backstage/ui/css/styles.css';
import { ConfigReader } from '@backstage/config';
import { Content, Header, Page, Table } from '@backstage/core-components';
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
  DRIFTED,
  ENABLED,
  ENABLED_BY_HAND,
  FAILED,
  FakeApi,
  installation,
  NOT_OPTED_IN,
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
  NOT_OPTED_IN,
];

const fakeApi = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: platformCapabilitiesApiRef,
      deps: {},
      factory: () =>
        new FakeApi({
          installations: INSTALLATIONS,
          unreadable: ['juniper'],
        }),
    }),
});

const row = (name: string, customer: string) =>
  ({
    entity: {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name },
      spec: { type: 'installation', owner: customer },
    },
    resolved: { name },
  }) as unknown as CatalogTableRow;

const ROWS = [
  ...INSTALLATIONS.map(i => row(i.name, i.customer ?? '')),
  row('juniper', 'example'),
  row('willow', 'example'),
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
          options={{ padding: 'dense', paging: false, search: false }}
          columns={[
            { title: 'Name', field: 'entity.metadata.name' },
            { title: 'Customer', field: 'entity.spec.owner' },
            ...columns,
          ]}
          data={ROWS}
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
