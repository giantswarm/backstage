import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  PageHeaderActionsProvider,
  usePageHeaderActionsSlot,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react';
import type { ServingContextValue } from '../ServingProvider';
import { KSERVE_CR_CAPABILITIES } from '../ServingProvider/useKServeServingSource';
import { GpuCapacityPage } from './GpuCapacityPage';

const mockUseServing = jest.fn<Partial<ServingContextValue>, []>();
// cluster-manager is absent on most of these fleets: the controls render
// nothing. The header case offers Add GPU node pool through `addAction`.
let mockAddAction:
  | { open: () => void; isDisabled: boolean; disabledReason?: string }
  | undefined;
jest.mock('../GpuNodePools', () => ({
  useGpuNodePoolControls: () => ({
    available: false,
    isLoading: false,
    addButton: undefined,
    addAction: mockAddAction,
    dialogs: undefined,
    panel: undefined,
    cachePanel: undefined,
  }),
}));

jest.mock('../ServingProvider', () => ({
  useServing: () => mockUseServing(),
}));

const HeaderActions = () => (
  <div data-testid="page-header-actions">{usePageHeaderActionsSlot()}</div>
);

const kserveServing: Partial<ServingContextValue> = {
  scope: 'all',
  isLoading: false,
  installations: ['inst-1'],
  backends: { 'inst-1': 'kserve' },
  capabilities: { 'inst-1': KSERVE_CR_CAPABILITIES },
  unreachableInstallations: [],
  servedModels: [],
  gpuNodes: [
    {
      id: 'inst-1/gpu-node-1',
      installation: 'inst-1',
      name: 'gpu-node-1',
      ready: true,
      product: 'NVIDIA-GB10',
      memoryMiB: 122880,
      labeledCount: 1,
    },
  ],
  gpuCapacityUnavailable: {},
};

describe('GpuCapacityPage', () => {
  beforeEach(() => {
    mockUseServing.mockReset();
    mockUseServing.mockReturnValue(kserveServing);
    mockAddAction = undefined;
  });

  describe('header actions', () => {
    let layout: MockedLayout | undefined;
    afterEach(() => {
      layout?.restore();
      layout = undefined;
    });

    it.each([
      ['on a wide screen', mockDesktopLayout],
      ['at phone width', mockPhoneLayout],
    ])(
      'offers Add GPU node pool as the one primary button %s',
      async (_width, mockLayout) => {
        layout = mockLayout();
        mockAddAction = { open: jest.fn(), isDisabled: false };
        await renderInTestApp(
          <PageHeaderActionsProvider>
            <HeaderActions />
            <GpuCapacityPage />
          </PageHeaderActionsProvider>,
        );

        const header = screen.getByTestId('page-header-actions');
        const buttons = within(header).getAllByRole('button');
        expect(buttons).toHaveLength(1);
        expect(buttons[0]).toHaveTextContent('Add GPU node pool');
        await userEvent.click(buttons[0]);
        expect(mockAddAction.open).toHaveBeenCalledTimes(1);
      },
    );

    it('disables Add GPU node pool with the reason where it cannot succeed', async () => {
      layout = mockDesktopLayout();
      const reason =
        'No environment in reach has a cluster to add a GPU node pool to.';
      mockAddAction = {
        open: jest.fn(),
        isDisabled: true,
        disabledReason: reason,
      };
      await renderInTestApp(
        <PageHeaderActionsProvider>
          <HeaderActions />
          <GpuCapacityPage />
        </PageHeaderActionsProvider>,
      );

      const header = screen.getByTestId('page-header-actions');
      const button = within(header).getByRole('button', {
        name: 'Add GPU node pool',
      });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(reason);
    });

    it('offers nothing where no installation runs cluster-manager', async () => {
      await renderInTestApp(
        <PageHeaderActionsProvider>
          <HeaderActions />
          <GpuCapacityPage />
        </PageHeaderActionsProvider>,
      );

      expect(screen.getByTestId('page-header-actions')).toBeEmptyDOMElement();
    });
  });

  it('lists the GPU nodes of the installations that report a node inventory', async () => {
    await renderInTestApp(<GpuCapacityPage />);

    expect(screen.getByText('GPU capacity')).toBeInTheDocument();
    expect(screen.getByText('NVIDIA-GB10')).toBeInTheDocument();
    expect(screen.queryByText('No GPU inventory')).not.toBeInTheDocument();
  });

  it('drops the Installation column when the nodes can only come from one installation', async () => {
    await renderInTestApp(<GpuCapacityPage />);

    expect(
      screen.getByRole('columnheader', { name: 'Node' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: 'Environment' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the Installation column when several installations report nodes', async () => {
    mockUseServing.mockReturnValue({
      ...kserveServing,
      installations: ['inst-1', 'inst-2'],
      backends: { 'inst-1': 'kserve', 'inst-2': 'kserve' },
      capabilities: {
        'inst-1': KSERVE_CR_CAPABILITIES,
        'inst-2': KSERVE_CR_CAPABILITIES,
      },
    });

    await renderInTestApp(<GpuCapacityPage />);

    expect(
      screen.getByRole('columnheader', { name: 'Environment' }),
    ).toBeInTheDocument();
  });

  it('explains the empty state on a fleet without a serving layer', async () => {
    mockUseServing.mockReturnValue({
      ...kserveServing,
      installations: [],
      backends: {},
      capabilities: {},
      gpuNodes: [],
    });

    await renderInTestApp(<GpuCapacityPage />);

    expect(screen.getByText('No GPU inventory')).toBeInTheDocument();
    expect(
      screen.getByText(/No reachable environment has a serving layer/),
    ).toBeInTheDocument();
  });

  it('explains the empty state when the serving layers report no nodes (Ollama)', async () => {
    mockUseServing.mockReturnValue({
      ...kserveServing,
      installations: ['inst-2'],
      backends: { 'inst-2': 'ollama' },
      capabilities: {
        'inst-2': { ...KSERVE_CR_CAPABILITIES, nodeInventory: false },
      },
      gpuNodes: [],
    });

    await renderInTestApp(<GpuCapacityPage />);

    expect(screen.getByText('No GPU inventory')).toBeInTheDocument();
    expect(screen.getByText(/do not report their nodes/)).toBeInTheDocument();
  });

  it('says no GPU node pool exists yet when the model-manager in view runs no backend', async () => {
    mockUseServing.mockReturnValue({
      ...kserveServing,
      installations: ['inst-2'],
      backends: {},
      sourceBackends: { 'inst-2': [] },
      capabilities: {},
      gpuNodes: [],
    });

    await renderInTestApp(<GpuCapacityPage />);

    expect(screen.getByText('No GPU node pools yet')).toBeInTheDocument();
    expect(
      screen.getByText(/model-manager on inst-2 has no backend registered/),
    ).toBeInTheDocument();
    expect(screen.queryByText('No GPU inventory')).not.toBeInTheDocument();
  });

  it('holds the empty state back while the serving layer is still being discovered', async () => {
    mockUseServing.mockReturnValue({
      ...kserveServing,
      isLoading: true,
      installations: [],
      backends: {},
      capabilities: {},
      gpuNodes: [],
    });

    await renderInTestApp(<GpuCapacityPage />);

    expect(screen.queryByText('No GPU inventory')).not.toBeInTheDocument();
  });

  it('renders the host an Ollama-backed model-manager reports as a node (model-manager 0.7+)', async () => {
    mockUseServing.mockReturnValue({
      ...kserveServing,
      installations: ['lab'],
      backends: { lab: 'ollama' },
      capabilities: {
        lab: { ...KSERVE_CR_CAPABILITIES, presets: false, nodeInventory: true },
      },
      gpuNodes: [
        {
          id: 'lab/172.21.0.1',
          installation: 'lab',
          name: '172.21.0.1',
          ready: true,
          memoryBudgetBytes: 92417933312,
          memoryBudgetSource: 'host-meminfo',
          memoryReservedBytes: 5403658158,
          memoryFreeBytes: 87014275154,
          accelerated: true,
        },
      ],
    });

    await renderInTestApp(<GpuCapacityPage />);

    expect(screen.queryByText('No GPU inventory')).not.toBeInTheDocument();
    expect(screen.getByText('GPU capacity')).toBeInTheDocument();
    expect(screen.getByText('172.21.0.1')).toBeInTheDocument();
    expect(screen.getByText('Backend host')).toBeInTheDocument();
    expect(screen.getByText('81.0 GiB free')).toBeInTheDocument();
    expect(
      screen.getByText('of 86.1 GiB · 5.0 GiB reserved'),
    ).toBeInTheDocument();
    expect(screen.getByText('accelerated')).toBeInTheDocument();
    expect(
      screen.getByText(/A backend host has no GPU figures/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: 'GPUs' }),
    ).not.toBeInTheDocument();
  });
});
