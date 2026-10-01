import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  InventoryProbeError,
  type InstallationInventory,
} from '@giantswarm/backstage-plugin-gs';
import { MusterApi, musterApiRef } from '../../apis';
import { MusterSubPage } from './MusterSubPage';

// MusterInstanceProvider is not stubbed: the gate reads what it derives from
// the inventory. Only its data sources are.
const EMPTY_INVENTORY: InstallationInventory = {
  entries: [],
  home: undefined,
  isLoading: false,
  isProbing: false,
  installationsWith: () => [],
  refresh: jest.fn(),
};
let mockInventory: InstallationInventory = EMPTY_INVENTORY;
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  // The real module for `selectInventoryFailure` and the inventory gate; the
  // two hooks are the data sources these tests set.
  ...jest.requireActual('@giantswarm/backstage-plugin-gs'),
  ALL_INSTALLATIONS: 'all',
  useInstallationInventory: () => mockInventory,
  useInstallationScope: () => ({
    scope: 'all',
    setScope: jest.fn(),
    installations: [],
    home: undefined,
    isSingleInstallation: false,
    isLoading: false,
  }),
}));
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: () => ({
    resources: [],
    errors: [],
    queries: [],
    isLoading: false,
    retry: jest.fn(),
  }),
  useShowErrors: () => jest.fn(),
}));

const musterApi = {
  listInstallations: jest.fn(async () => ({
    installations: [{ name: 'gazelle' }],
  })),
} as unknown as MusterApi;

const CONTEXT =
  'The MCP servers of an installation are read through its Kubernetes API.';

function renderSubPage() {
  return renderInTestApp(
    <MusterSubPage context={CONTEXT}>
      <div>tab-content</div>
    </MusterSubPage>,
    { apis: [[musterApiRef, musterApi]] },
  );
}

describe('MusterSubPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockInventory = EMPTY_INVENTORY;
  });

  it('renders the inventory gate in place of the tab when the only installation refused the probe', async () => {
    // The home's `GET /apis` answered 401: the tab lists no installation, and
    // the gate names it, quotes the 401 and offers the sign-out.
    mockInventory = {
      ...EMPTY_INVENTORY,
      home: 'gazelle',
      entries: [
        {
          installation: 'gazelle',
          home: true,
          accessState: 'healthy',
          muted: false,
          probe: 'failed',
          components: {
            kagent: false,
            muster: false,
            kserve: false,
            capi: false,
          },
          error: new InventoryProbeError('gazelle', 401, 'HTTP 401'),
        },
      ],
    };

    await renderSubPage();

    expect(
      await screen.findByText(
        `${CONTEXT} The API server of gazelle rejected the portal's token (HTTP 401): your sign-in did not grant what it requires, and a silent refresh cannot repair that. Sign out of the portal and sign in again.`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('tab-content')).toBeNull();
  });

  it('renders the tab when the inventory answered', async () => {
    await renderSubPage();

    expect(await screen.findByText('tab-content')).toBeInTheDocument();
  });
});
