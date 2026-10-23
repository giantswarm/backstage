import { screen, within } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';

import type {
  Toolchain,
  ToolchainList,
  ToolchainSource,
} from '../../lib/toolchainManager';
import { toolchainsRouteRef } from '../../routes';
import { CustomizeToolchainsPanel } from './CustomizeToolchainsPanel';

function toolchain(name: string, versions: string[]): Toolchain {
  return {
    name,
    source: 'agent-toolchains',
    repository: 'giantswarm/agent-toolchains',
    version: versions[0],
    image: `gsoci.azurecr.io/giantswarm/agent-toolchains/${name}:${versions[0].slice(1)}`,
    publishedAt: '2026-10-22T16:29:02Z',
    versions,
  };
}

const SOURCE: ToolchainSource = {
  name: 'agent-toolchains',
  repository: 'giantswarm/agent-toolchains',
  url: 'https://github.com/giantswarm/agent-toolchains',
  registry: 'gsoci.azurecr.io/giantswarm/agent-toolchains',
  origin: 'configured',
  phase: 'Approved',
  offered: true,
};

let mockScope: {
  installations: string[];
  sharedIdentity: string[];
  hasToolchains?: boolean;
};
let mockList: { isPending: boolean; error: Error | null; data?: ToolchainList };
const TOOLS: Record<string, string[]> = {
  go: ['go', 'gofmt', 'golangci-lint'],
  node: ['node', 'npm'],
};

jest.mock('../../hooks/useToolchainManager', () => ({
  useScopedToolchainInstallations: () => mockScope,
  useToolchains: () => ({
    isAvailable: true,
    isLoading: false,
    list: mockList,
  }),
  useToolchainDescription: (
    _installation: string,
    name: string,
    { source }: { source?: string } = {},
  ) => ({
    isPending: false,
    error: null,
    data: {
      toolchain: {
        name,
        tools: (source === 'acme' ? ['acme-go'] : TOOLS[name]).map(tool => ({
          name: tool,
          version: '--version',
        })),
      },
    },
  }),
  useToolchainSources: () => ({
    isPending: false,
    error: null,
    data: { sources: [SOURCE] },
  }),
}));
jest.mock('../AddToolchainSourceDialog', () => ({
  AddToolchainSourceButton: () => <button>Add source</button>,
}));
jest.mock('../ToolchainGrantPrompt', () => ({
  ToolchainGrantPrompt: (props: { answer?: { message?: string } }) => (
    <p>{`Grant: ${props.answer?.message}`}</p>
  ),
}));

function renderPanel(search = '') {
  return renderInTestApp(<CustomizeToolchainsPanel search={search} />, {
    mountedRoutes: { '/customize/toolchains': toolchainsRouteRef },
  });
}

beforeEach(() => {
  mockScope = {
    installations: ['gazelle'],
    sharedIdentity: [],
    hasToolchains: true,
  };
  mockList = {
    isPending: false,
    error: null,
    data: {
      toolchains: [
        toolchain('go', ['v0.2.0', 'v0.1.0']),
        toolchain('node', ['v0.2.0']),
      ],
    },
  };
});

describe('CustomizeToolchainsPanel', () => {
  it('lists the toolchains with their versions and tools, each opening its page', async () => {
    await renderPanel();

    const go = screen.getByRole('row', { name: /^go/ });
    expect(within(go).getByText('0.2.0, 0.1.0')).toBeInTheDocument();
    expect(
      within(go).getByText('go, gofmt, golangci-lint'),
    ).toBeInTheDocument();
    expect(within(go).getByRole('link', { name: 'go' })).toHaveAttribute(
      'href',
      '/customize/toolchains/gazelle/go',
    );
    const node = screen.getByRole('row', { name: /^node/ });
    expect(within(node).getByText('node, npm')).toBeInTheDocument();
  });

  it('lists the sources with their state and the Add source action', async () => {
    await renderPanel();

    const source = screen.getByRole('row', {
      name: /^giantswarm\/agent-toolchains/,
    });
    expect(within(source).getByText('Offered')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add source' }),
    ).toBeInTheDocument();
  });

  it('narrows the list by the search', async () => {
    await renderPanel('nod');

    expect(screen.queryByRole('row', { name: /^go/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /^node/ })).toBeInTheDocument();
  });

  it("asks for the App's grant instead of the list while it is missing", async () => {
    mockList = {
      isPending: false,
      error: null,
      data: {
        toolchains: [],
        status: 'grant_required',
        apps: ['toolchain-manager'],
        message: 'grant the App in muster',
      },
    };
    await renderPanel();

    expect(
      screen.getByText('Grant: grant the App in muster'),
    ).toBeInTheDocument();
  });

  it('says a source it could not read, beside the rest', async () => {
    mockList.data!.unreachable = [
      {
        source: 'acme',
        repository: 'acme/toolchains',
        reason: 'the App is not installed there',
      },
    ];
    await renderPanel();

    expect(
      screen.getByText('The toolchains of acme/toolchains could not be read'),
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /^go/ })).toBeInTheDocument();
  });

  it('says toolchains are off where no installation runs the toolchain-manager', async () => {
    mockScope = { installations: [], sharedIdentity: [], hasToolchains: false };
    await renderPanel();

    expect(
      screen.getByText('Toolchains are not available here'),
    ).toBeInTheDocument();
  });

  it('says why toolchains are withheld where muster has no per-user sign-in', async () => {
    mockScope = {
      installations: [],
      sharedIdentity: ['gazelle'],
      hasToolchains: false,
    };
    await renderPanel();

    expect(
      screen.getByText('Toolchains cannot be used on gazelle from this portal'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Toolchains are not available here'),
    ).not.toBeInTheDocument();
  });

  it('opens and describes the row’s own source where two sources publish one name', async () => {
    mockList.data!.toolchains.push({
      ...toolchain('go', ['v1.0.0']),
      source: 'acme',
      repository: 'acme/toolchains',
    });
    await renderPanel();

    const [ours, theirs] = screen
      .getAllByRole('row')
      .filter(row => within(row).queryByRole('link', { name: 'go' }));
    expect(within(ours).getByRole('link', { name: 'go' })).toHaveAttribute(
      'href',
      '/customize/toolchains/gazelle/go?source=agent-toolchains',
    );
    expect(within(theirs).getByRole('link', { name: 'go' })).toHaveAttribute(
      'href',
      '/customize/toolchains/gazelle/go?source=acme',
    );
    expect(within(theirs).getByText('acme-go')).toBeInTheDocument();
  });
});
