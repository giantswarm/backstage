import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ServedModelRow } from './ServedModelsTable';
import { StopServedModelDialog } from './StopServedModelDialog';

const row: ServedModelRow = {
  id: 'inst-1/kserve/model-serving/qwen3-14b',
  installation: 'inst-1',
  backend: 'kserve',
  name: 'qwen3-14b',
  namespace: 'model-serving',
  readiness: 'ready',
  endpointHosts: [],
  displayName: 'Qwen3 14B',
  usedBy: [
    {
      installation: 'inst-1',
      namespace: 'kagent',
      name: 'qwen3-14b',
      displayName: 'Qwen3 14B (portal)',
    },
  ],
};

const onConfirm = jest.fn();
const onOpenChange = jest.fn();

function renderDialog(
  props: Partial<Parameters<typeof StopServedModelDialog>[0]> = {},
) {
  return render(
    <StopServedModelDialog
      model={row}
      isOpen
      onOpenChange={onOpenChange}
      isStopping={false}
      onConfirm={onConfirm}
      {...props}
    />,
  );
}

beforeEach(() => {
  onConfirm.mockReset();
  onOpenChange.mockReset();
});

describe('StopServedModelDialog', () => {
  it('explains what stopping does and what stays', () => {
    renderDialog();

    expect(screen.getByText('Stop serving "Qwen3 14B"?')).toBeInTheDocument();
    expect(
      screen.getByText(/weights stay in the model cache/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Qwen3 14B \(portal\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/stays in place so agents keep their configuration/),
    ).toBeInTheDocument();
  });

  it('says nothing about model configs when there are none', () => {
    renderDialog({ model: { ...row, usedBy: [] } });

    expect(
      screen.queryByText(/keep their configuration/),
    ).not.toBeInTheDocument();
  });

  it('confirms without closing, and shows a failure', async () => {
    renderDialog({ error: 'inferenceservices is forbidden' });

    await userEvent.click(screen.getByRole('button', { name: 'Stop serving' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(
      screen.getByText('inferenceservices is forbidden'),
    ).toBeInTheDocument();
  });

  it('locks while stopping', () => {
    renderDialog({ isStopping: true });

    // bui renders a pending button as aria-disabled rather than disabled.
    expect(screen.getByRole('button', { name: /Stopping…/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
