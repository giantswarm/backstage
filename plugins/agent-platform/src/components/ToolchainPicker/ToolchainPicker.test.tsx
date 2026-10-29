import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AgentRow } from '../AgentsDataProvider';
import type { Toolchain, ToolchainPick } from '../../lib/toolchainManager';
import { pickerRows, ToolchainPicker, versionOptions } from './ToolchainPicker';

let mockCapabilities: Record<string, boolean> = { toolchains: true };
jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerInfo: () => ({
    info: { capabilities: mockCapabilities },
    isLoading: false,
    error: null,
  }),
}));

function toolchain(name: string, versions: string[]): Toolchain {
  return {
    name,
    source: 'agent-toolchains',
    repository: 'giantswarm/agent-toolchains',
    version: versions[0],
    image: `gsoci.azurecr.io/giantswarm/agent-toolchains/${name}:${versions[0].slice(1)}`,
    versions,
  };
}

let mockToolchains: Toolchain[] = [];
jest.mock('../../hooks/useToolchainManager', () => ({
  useToolchains: (installation?: string) => ({
    isAvailable: Boolean(installation),
    isLoading: false,
    list: { data: installation ? { toolchains: mockToolchains } : undefined },
  }),
}));

const agent: AgentRow = {
  id: 'gazelle/kagent/coder',
  installation: 'gazelle',
  namespace: 'kagent',
  name: 'Coder',
  technicalName: 'coder',
  description: '',
  skillCount: 0,
  readiness: 'ready',
  defaultToolchains: [{ name: 'go' }],
};

/** The picker with its value kept, as the composer keeps it. */
function Harness({ onChange }: { onChange: jest.Mock }) {
  const [value, setValue] = useState<ToolchainPick[] | undefined>();
  return (
    <ToolchainPicker
      agent={agent}
      value={value}
      onChange={next => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

beforeEach(() => {
  mockCapabilities = { toolchains: true };
  mockToolchains = [
    toolchain('go', ['v0.2.0', 'v0.1.0']),
    toolchain('node', ['v0.2.0']),
  ];
});

describe('ToolchainPicker', () => {
  it("presets the agent's defaults and changes go to an older version", async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    const trigger = screen.getByRole('button', {
      name: 'Toolchains: go latest',
    });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Toolchains' });
    expect(within(dialog).getByText(/Coder’s defaults/)).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: 'go' })).toBeChecked();
    expect(
      within(dialog).getByRole('checkbox', { name: 'node' }),
    ).not.toBeChecked();

    await userEvent.click(
      within(dialog).getByRole('button', { name: /go version/ }),
    );
    await userEvent.click(await screen.findByRole('option', { name: '0.1.0' }));

    expect(onChange).toHaveBeenLastCalledWith([
      { name: 'go', version: '0.1.0' },
    ]);
  });

  it('adds a toolchain, and a choice back at the defaults is the defaults', async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Toolchains: go latest' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Toolchains' });
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: 'node' }),
    );
    expect(onChange).toHaveBeenLastCalledWith([
      { name: 'go' },
      { name: 'node' },
    ]);

    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: 'node' }),
    );
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('removes every toolchain, which mounts none', async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Toolchains: go latest' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Toolchains' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'go' }));

    expect(onChange).toHaveBeenLastCalledWith([]);
    await userEvent.keyboard('{Escape}');
    expect(
      screen.getByRole('button', { name: 'Toolchains: No toolchains' }),
    ).toBeInTheDocument();
  });

  it('renders nothing where agent-manager mounts no toolchains', () => {
    mockCapabilities = {};
    const { container } = render(<Harness onChange={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing where the installation lists no toolchain', () => {
    mockToolchains = [];
    const { container } = render(<Harness onChange={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('pickerRows', () => {
  it('lists a name two sources publish once, and a pick the list lacks', () => {
    const go = toolchain('go', ['v1.0.0']);
    const rows = pickerRows(
      [go, { ...toolchain('go', ['v2.0.0']), source: 'acme' }],
      [{ name: 'go' }, { name: 'retired' }],
    );

    expect(rows).toEqual([{ name: 'go', toolchain: go }, { name: 'retired' }]);
  });
});

describe('versionOptions', () => {
  it('keeps a pinned version that is no longer published', () => {
    const labels = versionOptions(
      { name: 'go', toolchain: toolchain('go', ['v1.1.0', 'v1.0.0']) },
      { name: 'go', version: 'v0.9.0' },
    ).map(option => option.label);

    expect(labels).toEqual([
      'Latest (1.1.0)',
      '1.1.0',
      '1.0.0',
      '0.9.0 (not published)',
    ]);
  });

  it('offers only Latest for a pick the list lacks', () => {
    expect(
      versionOptions({ name: 'retired' }, { name: 'retired' }).map(
        option => option.label,
      ),
    ).toEqual(['Latest']);
  });
});
