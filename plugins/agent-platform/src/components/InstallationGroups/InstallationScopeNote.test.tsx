import { render, screen } from '@testing-library/react';
import type { InstallationInventoryEntry } from '@giantswarm/backstage-plugin-gs';
import { InstallationScopeNote } from './InstallationScopeNote';

let mockScope = 'all';
let mockEntries: InstallationInventoryEntry[] = [];
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ALL_INSTALLATIONS: 'all',
  PLATFORM_COMPONENT_LABELS: {
    kagent: 'kagent',
    muster: 'muster',
    kserve: 'KServe',
    capi: 'Cluster API',
  },
  useInstallationScope: () => ({ scope: mockScope, isLoading: false }),
  useInstallationInventory: () => ({ entries: mockEntries }),
}));

function entry(
  installation: string,
  overrides: Partial<InstallationInventoryEntry> = {},
): InstallationInventoryEntry {
  return {
    installation,
    home: false,
    accessState: 'healthy',
    probe: 'answered',
    components: { kagent: true, muster: false, kserve: false, capi: true },
    ...overrides,
  };
}

describe('InstallationScopeNote', () => {
  beforeEach(() => {
    mockScope = 'all';
    mockEntries = [
      entry('golem'),
      entry('wombat', {
        components: { kagent: false, muster: true, kserve: false, capi: true },
      }),
      entry('slug', { probe: 'pending', accessState: 'connecting' }),
    ];
  });

  it('says nothing under all installations', () => {
    const { container } = render(<InstallationScopeNote component="kagent" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing for a pinned installation that runs the component, or is still being probed', () => {
    mockScope = 'golem';
    expect(
      render(<InstallationScopeNote component="kagent" />).container,
    ).toBeEmptyDOMElement();

    mockScope = 'slug';
    expect(
      render(<InstallationScopeNote component="kagent" />).container,
    ).toBeEmptyDOMElement();
  });

  it('names the missing component on the pinned installation', () => {
    mockScope = 'wombat';
    render(<InstallationScopeNote component="kagent" />);
    expect(
      screen.getByText('kagent is not installed on wombat.'),
    ).toBeInTheDocument();
  });

  it('says when the portal does not know the pinned installation', () => {
    mockScope = 'nowhere';
    render(<InstallationScopeNote component="kagent" />);
    expect(
      screen.getByText(/knows no installation named “nowhere”/),
    ).toBeInTheDocument();
  });
});
