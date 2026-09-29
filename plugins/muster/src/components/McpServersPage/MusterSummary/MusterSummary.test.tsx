import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { MCPServer, MCPServerState } from '../../../lib/k8s';
import { MusterSummary } from './MusterSummary';

// The real InfoHint, with its tooltip text also rendered alongside: opening a
// bui tooltip by hover in jsdom works only once another one has warmed up.
// InfoHint's own tests cover the opening.
jest.mock('@giantswarm/backstage-plugin-ui-react', () => {
  const actual = jest.requireActual('@giantswarm/backstage-plugin-ui-react');
  return {
    ...actual,
    InfoHint: (props: { label: string; children: React.ReactNode }) => (
      <>
        <actual.InfoHint {...props} />
        <span data-testid="info-hint">{props.children}</span>
      </>
    ),
  };
});

let endpoint: string | undefined;
let session: { toolCount?: number; toolCountPending?: boolean };

jest.mock('../../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    activeInstallation: 'gazelle',
    activeInstallationInfo: { name: 'gazelle', endpoint, requiresAuth: true },
  }),
  useMusterSession: () => ({
    authenticated: session.toolCount !== undefined,
    pending: false,
    connecting: false,
    connect: jest.fn(),
    ...session,
  }),
}));

function server(
  name: string,
  state: MCPServerState,
  suspended = false,
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name },
      spec: { type: 'streamable-http', suspended },
      status: { state },
    } as never,
    'gazelle',
  );
}

/** The totals line's full text; its healthy count is a nested span. */
function totalsLine(): string {
  const count = screen.getByText(/healthy$/);
  return count.parentElement?.textContent ?? '';
}

describe('MusterSummary', () => {
  beforeEach(() => {
    endpoint = 'https://muster.gazelle.example.com/mcp';
    session = { toolCount: 42 };
  });

  it('shows the endpoint with a copy button, and the totals', async () => {
    await renderInTestApp(
      <MusterSummary
        servers={[
          server('a', 'Connected'),
          server('b', 'Auth Required'),
          server('c', 'Failed'),
        ]}
      />,
    );

    expect(
      screen.getByText('https://muster.gazelle.example.com/mcp'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy endpoint' }),
    ).toBeInTheDocument();
    expect(totalsLine()).toBe('3 servers · 2 healthy · 42 tools');
  });

  it('holds a placeholder while the tool count is on its way', async () => {
    session = { toolCountPending: true };
    await renderInTestApp(
      <MusterSummary servers={[server('a', 'Connected')]} />,
    );

    expect(totalsLine()).toBe('1 server · 1 healthy · … tools');
  });

  it('leaves the tool total out without a muster session', async () => {
    session = {};
    await renderInTestApp(
      <MusterSummary servers={[server('a', 'Connected')]} />,
    );

    expect(totalsLine()).toBe('1 server · 1 healthy');
  });

  it('counts deactivated servers apart and says so in the hint', async () => {
    await renderInTestApp(
      <MusterSummary
        servers={[
          server('a', 'Connected'),
          server('b', 'Disconnected', true),
          server('c', 'Disconnected', true),
        ]}
      />,
    );

    expect(totalsLine()).toBe('1 server · 1 healthy · 42 tools');
    expect(
      screen.getByRole('button', { name: 'How healthy servers are counted' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('info-hint')).toHaveTextContent(
      '2 deactivated servers are not counted.',
    );
  });

  it('says so when the installation has no endpoint configured', async () => {
    endpoint = undefined;
    await renderInTestApp(<MusterSummary servers={[]} />);

    expect(screen.getByText('not configured for gazelle')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy endpoint' })).toBeNull();
    expect(totalsLine()).toBe('0 servers · 0 healthy · 42 tools');
  });
});
