import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MusterInstance,
  MusterInstanceContext,
} from '../MusterInstanceProvider';
import {
  InstallationPicker,
  isNotReachable,
  NOT_REACHABLE_HINT,
} from './InstallationPicker';

function instance(overrides: Partial<MusterInstance> = {}): MusterInstance {
  const installationInfos = [
    { name: 'gazelle', requiresAuth: true, reachable: true as const },
    {
      name: 'wombat',
      requiresAuth: true,
      reachable: false as const,
      reason: 'no answer within 3000 ms',
    },
    { name: 'golem', requiresAuth: true, reachable: 'unknown' as const },
  ];
  return {
    installations: installationInfos.map(i => i.name),
    installationInfos,
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    activeInstallationInfo: installationInfos[0],
    setActiveInstallation: jest.fn(),
    mcpServers: [],
    workflows: [],
    isLoading: false,
    dataUpdatedAt: undefined,
    isRefreshing: false,
    retry: jest.fn(),
    ...overrides,
  };
}

function renderPicker(value: MusterInstance) {
  return render(
    <MusterInstanceContext.Provider value={value}>
      <InstallationPicker />
    </MusterInstanceContext.Provider>,
  );
}

describe('InstallationPicker', () => {
  it('lists every installation and marks the one the portal cannot reach', async () => {
    renderPicker(instance());

    await userEvent.click(
      screen.getByTestId('installation-autocomplete-expand'),
    );

    const options = screen.getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual([
      'gazelle',
      `wombat${NOT_REACHABLE_HINT}`,
      'golem',
    ]);
    // Unknown reachability (no probe settled yet) is not a mark.
    expect(screen.getAllByText(NOT_REACHABLE_HINT)).toHaveLength(1);
  });

  it('keeps an unreachable installation selectable (its CRD-backed screens work)', async () => {
    const setActiveInstallation = jest.fn();
    renderPicker(instance({ setActiveInstallation }));

    await userEvent.click(
      screen.getByTestId('installation-autocomplete-expand'),
    );
    await userEvent.click(screen.getByRole('option', { name: /wombat/ }));

    expect(setActiveInstallation).toHaveBeenCalledWith('wombat');
  });

  it('renders nothing while the list is loading or empty', () => {
    const { container: loading } = renderPicker(
      instance({ isLoadingInstallations: true }),
    );
    expect(loading).toBeEmptyDOMElement();

    const { container: empty } = renderPicker(
      instance({ installations: [], installationInfos: [] }),
    );
    expect(empty).toBeEmptyDOMElement();
  });
});

describe('isNotReachable', () => {
  it('is true only for an explicit false from the backend', () => {
    expect(isNotReachable({ reachable: false })).toBe(true);
    expect(isNotReachable({ reachable: true })).toBe(false);
    expect(isNotReachable({ reachable: 'unknown' })).toBe(false);
    expect(isNotReachable({})).toBe(false);
    expect(isNotReachable(undefined)).toBe(false);
  });
});
