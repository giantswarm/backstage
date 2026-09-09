import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { identityApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import type {
  InstallationInventory,
  InstallationInventoryEntry,
} from '../../apis/installationInventory/types';
import { InventoryProbeError } from '../../apis/installationInventory/probeInstallationInventory';
import type { InstallationScope } from '../../apis/installationScope/installationScopeStore';
import { InstallationInventoryGate } from './InstallationInventoryGate';

let mockInventory: Pick<InstallationInventory, 'entries' | 'home' | 'refresh'>;
let mockScope: InstallationScope = 'all';

jest.mock('../../apis/installationInventory/useInstallationInventory', () => ({
  useInstallationInventory: () => ({
    ...mockInventory,
    isLoading: false,
    isProbing: false,
    installationsWith: () => [],
  }),
}));
jest.mock('../../apis/installationScope/useInstallationScope', () => ({
  useInstallationScope: () => ({
    scope: mockScope,
    setScope: jest.fn(),
    installations: [],
    home: mockInventory.home,
    isSingleInstallation: false,
    isLoading: false,
  }),
}));

const NONE = { kagent: false, muster: false, kserve: false, capi: false };

function entry(
  installation: string,
  overrides: Partial<InstallationInventoryEntry> = {},
): InstallationInventoryEntry {
  return {
    installation,
    home: installation === 'gazelle',
    accessState: 'healthy',
    probe: 'answered',
    components: NONE,
    ...overrides,
  };
}

const unauthorized = new InventoryProbeError('gazelle', 401, '');
const forbidden = new InventoryProbeError('golem', 403, '');

function renderGate() {
  const signOut = jest.fn().mockResolvedValue(undefined);
  render(
    <TestApiProvider apis={[[identityApiRef, { signOut }]]}>
      <InstallationInventoryGate context="Which installations run kagent is read through their Kubernetes API." />
    </TestApiProvider>,
  );
  return { signOut };
}

describe('InstallationInventoryGate', () => {
  beforeEach(() => {
    mockScope = 'all';
    mockInventory = {
      home: 'gazelle',
      entries: [entry('gazelle'), entry('golem')],
      refresh: jest.fn(),
    };
  });

  it('renders nothing while every probe of interest is pending or answered', () => {
    const { container } = render(
      <TestApiProvider apis={[[identityApiRef, { signOut: jest.fn() }]]}>
        <InstallationInventoryGate />
      </TestApiProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('explains the home installation\'s rejected token under "All installations"', async () => {
    const user = userEvent.setup();
    mockInventory.entries = [
      entry('gazelle', { probe: 'failed', error: unauthorized }),
      entry('golem'),
    ];
    const { signOut } = renderGate();

    expect(
      screen.getByText(
        /^Which installations run kagent is read through their Kubernetes API\. The API server of gazelle rejected the portal's token \(HTTP 401\)/,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("explains the pinned installation's refused read and retries the probes", async () => {
    const user = userEvent.setup();
    mockScope = 'golem';
    mockInventory.entries = [
      entry('gazelle', { probe: 'failed', error: unauthorized }),
      entry('golem', { probe: 'failed', error: forbidden }),
    ];
    renderGate();

    expect(
      screen.getByText(
        /The API server of golem refused to list its API groups/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/gazelle/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockInventory.refresh).toHaveBeenCalledTimes(1);
  });

  it("stays quiet about the home's failure while the pinned installation answered", () => {
    mockScope = 'golem';
    mockInventory.entries = [
      entry('gazelle', { probe: 'failed', error: unauthorized }),
      entry('golem'),
    ];
    const { container } = render(
      <TestApiProvider apis={[[identityApiRef, { signOut: jest.fn() }]]}>
        <InstallationInventoryGate />
      </TestApiProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
