import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import type { InstallationInventoryEntry } from '@giantswarm/backstage-plugin-gs';
import {
  componentForTab,
  InstallationScopeHeaderControl,
} from './InstallationScopeHeaderControl';

// The selector itself is the gs plugin's (tested there); here it reports what
// the header control hands it. The query client is a pass-through.
const mockSelect = jest.fn();
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  InstallationScopeSelect: (props: {
    component?: string;
    describe?: (entry: InstallationInventoryEntry) => string | undefined;
  }) => {
    mockSelect(props);
    return <div data-testid="select">{props.component ?? 'none'}</div>;
  },
}));

jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

let mockNotReachable: string[] = [];
jest.mock('../../hooks/useKagentInstallations', () => ({
  useKagentInstallations: () => ({
    isNotReachable: (installation: string) =>
      mockNotReachable.includes(installation),
  }),
}));

// The muster backend's probe, read through the muster plugin's hook.
let mockMusterNotReachable: string[] = [];
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  useMusterInstallations: () => ({
    installations: [],
    isLoading: false,
    isNotReachable: (installation: string) =>
      mockMusterNotReachable.includes(installation),
  }),
}));

function entry(installation: string): InstallationInventoryEntry {
  return {
    installation,
    home: false,
    accessState: 'healthy',
    probe: 'answered',
    components: { kagent: true, muster: true, kserve: false, capi: true },
  };
}

function renderAt(path: string) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/agent-platform/*"
        element={<InstallationScopeHeaderControl />}
      />
    </Routes>,
    { initialRouteEntries: [path] },
  );
}

describe('componentForTab', () => {
  it('maps the level-1 tabs to the component they read', () => {
    expect(componentForTab('agents')).toBe('kagent');
    expect(componentForTab('sessions/gazelle/abc')).toBe('kagent');
    expect(componentForTab('models/configs')).toBe('kagent');
    expect(componentForTab('/muster/dashboard')).toBe('muster');
  });

  it('knows no component for the section index or an unknown tab', () => {
    expect(componentForTab('')).toBeUndefined();
    expect(componentForTab('clusters')).toBeUndefined();
  });
});

describe('InstallationScopeHeaderControl', () => {
  beforeEach(() => {
    mockSelect.mockClear();
    mockNotReachable = [];
    mockMusterNotReachable = [];
  });

  it('tells the selector which component the current tab reads', async () => {
    await renderAt('/agent-platform/muster/servers');

    expect(screen.getByTestId('select')).toHaveTextContent('muster');
  });

  it('marks installations whose kagent the portal cannot reach, on kagent tabs only', async () => {
    mockNotReachable = ['golem'];
    await renderAt('/agent-platform/sessions');

    const { describe } = mockSelect.mock.calls.at(-1)![0];
    expect(describe(entry('golem'))).toBe('not reachable from this portal');
    expect(describe(entry('wombat'))).toBeUndefined();
  });

  it('says nothing about kagent reachability on the MCP Servers tab', async () => {
    mockNotReachable = ['golem'];
    await renderAt('/agent-platform/muster');

    const { describe } = mockSelect.mock.calls.at(-1)![0];
    expect(describe(entry('golem'))).toBeUndefined();
  });

  it('marks installations whose muster the portal cannot reach, on the MCP Servers tab only', async () => {
    mockMusterNotReachable = ['wombat'];
    await renderAt('/agent-platform/muster/dashboard');

    const { describe } = mockSelect.mock.calls.at(-1)![0];
    expect(describe(entry('wombat'))).toBe('not reachable from this portal');
    expect(describe(entry('golem'))).toBeUndefined();
  });

  it('says nothing about muster reachability on the kagent tabs', async () => {
    mockMusterNotReachable = ['wombat'];
    await renderAt('/agent-platform/agents');

    const { describe } = mockSelect.mock.calls.at(-1)![0];
    expect(describe(entry('wombat'))).toBeUndefined();
  });
});
