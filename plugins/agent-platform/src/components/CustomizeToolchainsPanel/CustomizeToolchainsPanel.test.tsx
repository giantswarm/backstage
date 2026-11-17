import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';

import { PortalSessionEndedError } from '../../lib/portalSession';
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
  hasToolchains?: boolean | 'unchecked';
  unchecked?: { installation: string; failure: string }[];
  recheck?: () => Promise<void>;
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
// Whether a read in the query cache was refused for the portal session.
let mockSessionEnded = false;
jest.mock('../../hooks/usePortalSessionEnded', () => ({
  usePortalSessionEnded: () => mockSessionEnded,
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
  mockSessionEnded = false;
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
    // The newest version and a count, every version on hover.
    expect(within(go).getByText('0.2.0 · 1 older')).toHaveAttribute(
      'title',
      '0.2.0, 0.1.0',
    );
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
    // The repository is on GitHub: it opens in a new tab, and says so.
    const repository = within(source).getByRole('link', {
      name: 'giantswarm/agent-toolchains (opens in a new tab)',
    });
    expect(repository).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/agent-toolchains',
    );
    expect(repository).toHaveAttribute('target', '_blank');
    expect(repository).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(source).getByText(SOURCE.registry)).toBeInTheDocument();
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

  it('says the portal session ended, with Sign in again, when only the portal session kept the installations from saying', async () => {
    mockScope = {
      installations: [],
      sharedIdentity: [],
      hasToolchains: 'unchecked',
      unchecked: [{ installation: 'gazelle', failure: 'signedOut' }],
      recheck: jest.fn(() => Promise.resolve()),
    };
    await renderPanel();

    expect(screen.getByText('Your portal session ended')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign in again' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry' }),
    ).not.toBeInTheDocument();
  });

  it('says the portal session ended once, with Sign in again, in place of the reads the portal refused', async () => {
    mockScope = {
      installations: ['gazelle', 'graveler'],
      sharedIdentity: [],
      hasToolchains: true,
    };
    mockList = {
      isPending: false,
      error: new PortalSessionEndedError(),
    };
    mockSessionEnded = true;
    await renderPanel();

    expect(screen.getAllByText('Your portal session ended')).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Sign in again' }),
    ).toHaveLength(1);
    expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument();
  });

  it('says the portal session ended, not a dash in each row, when the portal refuses the tools reads', async () => {
    // The list was read before; the rows' tools reads are what failed.
    mockSessionEnded = true;
    await renderPanel();

    expect(screen.getByText('Your portal session ended')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /^go/ })).not.toBeInTheDocument();
  });

  it('says the portal session ended, with Sign in again, over installations that could not say for other reasons too', async () => {
    mockScope = {
      installations: [],
      sharedIdentity: [],
      hasToolchains: 'unchecked',
      unchecked: [
        { installation: 'gazelle', failure: 'signedOut' },
        { installation: 'graveler', failure: 'notAnswering' },
      ],
      recheck: jest.fn(() => Promise.resolve()),
    };
    mockSessionEnded = true;
    await renderPanel();

    expect(screen.getAllByText('Your portal session ended')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Sign in again' }),
    ).toBeInTheDocument();
  });

  it('says why no installation could say whether it runs the toolchain-manager, and asks again', async () => {
    const recheck = jest.fn(() => Promise.resolve());
    mockScope = {
      installations: [],
      sharedIdentity: [],
      hasToolchains: 'unchecked',
      unchecked: [
        { installation: 'gazelle', failure: 'tokenRejected' },
        { installation: 'otter', failure: 'signedOut' },
        { installation: 'heron', failure: 'notAnswering' },
        { installation: 'ibis', failure: 'notAnswering' },
      ],
      recheck,
    };
    await renderPanel();

    expect(
      screen.getByText('Toolchains could not be checked'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Muster on gazelle refused your sign-in. Your portal session has ended, so Muster on otter could not be asked. Sign in again. Muster on heron and ibis did not answer.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Reading the toolchains…'),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(recheck).toHaveBeenCalledTimes(1);
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
