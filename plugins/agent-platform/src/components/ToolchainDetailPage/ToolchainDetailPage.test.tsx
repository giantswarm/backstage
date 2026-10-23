import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';

import type { ToolchainDescribeResult } from '../../lib/toolchainManager';
import { toolchainsRouteRef } from '../../routes';
import { ToolchainDetailPage } from './ToolchainDetailPage';

const mockDescribe = jest.fn();
jest.mock('../../hooks/useToolchainManager', () => ({
  useToolchainManagerAvailability: () => ({
    isAvailable: true,
    isLoading: false,
  }),
  useToolchainDescription: (
    _installation: string,
    _name: string,
    options: { source?: string; version?: string },
  ) => mockDescribe(options.version, options.source),
  useToolchainSources: () => ({
    data: {
      status: 'ok',
      sources: [
        {
          name: 'agent-toolchains',
          repository: 'giantswarm/agent-toolchains',
          url: 'https://github.com/giantswarm/agent-toolchains',
        },
      ],
    },
  }),
}));
jest.mock('../CodeBlock', () => ({
  CodeBlock: (props: { content: string }) => <pre>{props.content}</pre>,
}));

function described(version: string): ToolchainDescribeResult {
  return {
    toolchain: {
      name: 'go',
      source: 'agent-toolchains',
      repository: 'giantswarm/agent-toolchains',
      version,
      image: `gsoci.azurecr.io/giantswarm/agent-toolchains/go:${version.slice(1)}`,
      versions: ['v0.2.0', 'v0.1.0'],
      harnesses: ['claude', 'codex'],
      tools: [
        { name: 'gofmt', version: 'gofmt -h' },
        { name: 'go', version: 'go version' },
      ],
      packages: { go: version === 'v0.2.0' ? '1.25.3-r0' : '1.24.9-r0' },
      egress: ['https://proxy.golang.org'],
      written: true,
      dockerfile: `# go ${version}`,
    },
  };
}

beforeEach(() => {
  mockDescribe.mockReset();
  mockDescribe.mockImplementation((version?: string) => ({
    isPending: false,
    error: null,
    data: described(version ? `v${version}` : 'v0.2.0'),
  }));
});

function renderPage(path?: string) {
  return renderInTestApp(
    <ToolchainDetailPage installation="gazelle" name="go" />,
    {
      mountedRoutes: { '/customize/toolchains': toolchainsRouteRef },
      ...(path ? { initialRouteEntries: [path] } : {}),
    },
  );
}

describe('ToolchainDetailPage', () => {
  it("shows the newest version's tools, Harnesses, pins and egress", async () => {
    await renderPage();

    expect(screen.getByRole('heading', { name: 'go' })).toBeInTheDocument();
    const tools = screen.getAllByRole('row').map(row => row.textContent);
    expect(tools.some(text => text?.startsWith('go'))).toBe(true);
    expect(screen.getByText('go version')).toBeInTheDocument();
    expect(screen.getByText('claude, codex')).toBeInTheDocument();
    expect(screen.getByText('go 1.25.3-r0')).toBeInTheDocument();
    expect(screen.getByText('https://proxy.golang.org')).toBeInTheDocument();
    expect(screen.getByText('# go v0.2.0')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'giantswarm/agent-toolchains' }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/agent-toolchains');
  });

  it('describes the source named in the address', async () => {
    await renderPage('/?source=acme');

    expect(mockDescribe).toHaveBeenLastCalledWith(undefined, 'acme');
  });

  it('switches to an older version', async () => {
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: /Version/ }));
    await userEvent.click(
      within(screen.getByRole('listbox')).getByRole('option', {
        name: '0.1.0',
      }),
    );

    expect(mockDescribe).toHaveBeenLastCalledWith('0.1.0', undefined);
    expect(await screen.findByText('go 1.24.9-r0')).toBeInTheDocument();
  });

  it('says why it cannot read the toolchain', async () => {
    mockDescribe.mockReturnValue({
      isPending: false,
      error: new Error('toolchain go has no published version v9.9.9'),
      data: undefined,
    });
    await renderPage();

    expect(screen.getByText('go could not be read')).toBeInTheDocument();
    expect(
      screen.getByText('toolchain go has no published version v9.9.9'),
    ).toBeInTheDocument();
  });
});
