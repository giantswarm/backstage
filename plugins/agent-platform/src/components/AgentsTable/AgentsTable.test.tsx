import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentRow } from '../AgentsDataProvider';
import { agentsRouteRef, modelsRouteRef } from '../../routes';
import { AgentsTable } from './AgentsTable';

const mockBuildAvatarUrl = jest.fn(
  (installation: string, name: string) =>
    `https://avatars.${installation}.example/v1/48/${name}.png`,
);

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => mockBuildAvatarUrl,
}));

// The row's programmatic navigation, and *only* it: `Link` resolves `useNavigate`
// internally within react-router-dom, so its own client-side navigation is
// untouched by this mock. A call here therefore means the row handler ran.
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Only the parent RouteRef is mountable — `mountedRoutes` rejects a SubRouteRef —
// and the detail sub-route resolves relative to it.
const renderTable = (element: React.ReactElement) =>
  renderInTestApp(element, {
    mountedRoutes: { '/agent-platform/agents': agentsRouteRef },
  });

const rows: AgentRow[] = [
  {
    id: 'inst-1/sre-team/triager',
    installation: 'inst-1',
    namespace: 'sre-team',
    name: 'Incident triager',
    technicalName: 'incident-triager',
    description: 'Triages incidents',
    model: 'Claude Sonnet 4.6',
    skillCount: 3,
    readiness: 'ready',
  },
  {
    id: 'inst-1/dev/byo',
    installation: 'inst-1',
    namespace: 'dev',
    name: 'BYO agent',
    technicalName: 'byo-agent',
    description: '',
    model: undefined,
    skillCount: 0,
    readiness: 'notReady',
    readinessMessage: 'Deployment is not ready, 0/1 pods are ready',
  },
];

describe('AgentsTable', () => {
  beforeEach(() => {
    mockBuildAvatarUrl.mockClear();
    mockNavigate.mockClear();
  });
  it('renders the column headers', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Installation')).toBeInTheDocument();
    expect(screen.getByText('Namespace')).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders each row readiness, explaining a non-ready one on hover', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Not ready')).toBeInTheDocument();
    expect(
      screen.getByTitle('Deployment is not ready, 0/1 pods are ready'),
    ).toBeInTheDocument();
  });

  it('labels a rejected agent distinctly from a not-ready one', async () => {
    await renderTable(
      <AgentsTable
        rows={[
          {
            ...rows[0],
            readiness: 'notAccepted',
            readinessMessage: 'bad spec',
          },
        ]}
      />,
    );

    expect(screen.getByText('Not accepted')).toBeInTheDocument();
    expect(screen.getByTitle('bad spec')).toBeInTheDocument();
  });

  it('shows an unreconciled agent as pending', async () => {
    await renderTable(
      <AgentsTable rows={[{ ...rows[0], readiness: 'pending' }]} />,
    );

    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders agent rows with resolved model and skill count', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    expect(screen.getByText('Incident triager')).toBeInTheDocument();
    expect(screen.getByText('Triages incidents')).toBeInTheDocument();
    expect(screen.getByText('Claude Sonnet 4.6')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows a dash for agents without a resolved model', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    expect(screen.getByText('BYO agent')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows the empty state when there are no agents', async () => {
    await renderTable(<AgentsTable rows={[]} />);

    expect(screen.getByText('No agents found.')).toBeInTheDocument();
  });

  it('links each agent name to its details page, keyed on all three identity parts', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    // Installation, namespace and the *technical* name — an Agent name is only
    // unique within a namespace on one installation.
    expect(
      screen.getByRole('link', { name: 'Incident triager' }),
    ).toHaveAttribute(
      'href',
      '/agent-platform/agents/inst-1/sre-team/incident-triager',
    );
    expect(screen.getByRole('link', { name: 'BYO agent' })).toHaveAttribute(
      'href',
      '/agent-platform/agents/inst-1/dev/byo-agent',
    );
  });

  // The name is wrapped in a bui `Text` for its truncation, which sets its own
  // colour — without an override the link renders in body text colour and stops
  // looking like a link, diverging from the Sessions table.
  it('lets the agent name inherit the link colour', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    const anchor = screen.getByRole('link', { name: 'Incident triager' });
    const label = anchor.querySelector('p')!;

    // Asserted as "same colour as the anchor" rather than the literal `inherit`:
    // that is the property that matters, and jsdom resolves `inherit` through the
    // cascade anyway.
    expect(getComputedStyle(label).color).toBe(getComputedStyle(anchor).color);
  });

  it('navigates on a whole-row click', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    await userEvent.click(screen.getByText('Claude Sonnet 4.6'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/agents/inst-1/sre-team/incident-triager',
    );
  });

  // Regression guard: the anchor and the row handler must not both fire, or a
  // single click pushes the same path twice and Back needs two presses.
  it('does not also fire the row handler when the name link is clicked', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    await userEvent.click(
      screen.getByRole('link', { name: 'Incident triager' }),
    );

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('builds each avatar from the technical name at the list size', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    // The avatar seeds from the technical (resource) name, not the display name.
    expect(mockBuildAvatarUrl).toHaveBeenCalledWith(
      'inst-1',
      'incident-triager',
      {
        size: 96,
      },
    );
    expect(mockBuildAvatarUrl).toHaveBeenCalledWith('inst-1', 'byo-agent', {
      size: 96,
    });
  });
});

// --- The model's serving state --------------------------------------------------

// The Serving view lives under the Models tab, so its route has to be mounted
// too for the Not serving label to link anywhere.
const renderTableWithModels = (element: React.ReactElement) =>
  renderInTestApp(element, {
    mountedRoutes: {
      '/agent-platform/agents': agentsRouteRef,
      '/agent-platform/models': modelsRouteRef,
    },
  });

const idleModelAgent: AgentRow = {
  ...rows[0],
  model: 'qwen3-0-6b',
  modelServing: {
    installation: 'inst-1',
    backend: 'ollama',
    readiness: 'idle',
    name: 'qwen3:0.6b',
    message: 'Downloaded; not loaded.',
  },
};

const goneModelAgent: AgentRow = {
  ...rows[0],
  id: 'inst-1/sre-team/orphan',
  name: 'Orphaned agent',
  technicalName: 'orphan',
  model: 'qwen2-5-0-5b',
  modelServing: {
    installation: 'inst-1',
    backend: 'ollama',
    readiness: 'notServing',
    name: 'qwen2.5:0.5b',
    message: 'Ollama model qwen2.5:0.5b is not on the backend at 172.21.0.1.',
  },
};

describe('AgentsTable model serving', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('labels the model with the shared vocabulary, explaining it on hover', async () => {
    await renderTableWithModels(<AgentsTable rows={[idleModelAgent]} />);

    expect(screen.getByText('qwen3-0-6b')).toBeInTheDocument();
    expect(screen.getByTestId('agent-model-serving')).toHaveTextContent('Idle');
    expect(
      screen.getByTitle(
        'Ollama model qwen3:0.6b is idle — loads on first request — Downloaded; not loaded.',
      ),
    ).toBeInTheDocument();
    // Idle is ordinary state: nothing to fix, so nothing to link.
    expect(
      screen.queryByRole('link', { name: 'Idle' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Incident triager' }).closest('td'),
    ).not.toHaveStyle('opacity: 0.55');
  });

  it('greys an agent whose model is gone and links its label to the Serving view', async () => {
    await renderTableWithModels(<AgentsTable rows={[goneModelAgent]} />);

    expect(screen.getByTestId('agent-model-serving')).toHaveTextContent(
      'Not serving',
    );
    expect(screen.getByRole('link', { name: 'Not serving' })).toHaveAttribute(
      'href',
      '/agent-platform/models/serving',
    );
    expect(
      screen.getByRole('link', { name: 'Orphaned agent' }).closest('td'),
    ).toHaveStyle('opacity: 0.55');
  });

  it('does not also navigate the row when the label link is pressed', async () => {
    await renderTableWithModels(<AgentsTable rows={[goneModelAgent]} />);

    await userEvent.click(screen.getByRole('link', { name: 'Not serving' }));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows the plain model name when the serving layer has no word on it', async () => {
    await renderTableWithModels(<AgentsTable rows={rows} />);

    expect(screen.getByText('Claude Sonnet 4.6')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-model-serving')).not.toBeInTheDocument();
  });
});
