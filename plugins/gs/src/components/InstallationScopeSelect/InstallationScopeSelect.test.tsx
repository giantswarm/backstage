import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type {
  InstallationInventory,
  InstallationInventoryEntry,
} from '../../apis/installationInventory/types';
import {
  __resetInstallationsConfigForTests,
  setInstallationsConfig,
} from '../../apis/installations';
import {
  __resetInstallationScopeForTests,
  getInstallationScopeSnapshot,
  setInstallationScope,
} from '../../apis/installationScope/installationScopeStore';
import { InstallationScopeSelect } from './InstallationScopeSelect';

let mockInventory: Pick<InstallationInventory, 'entries' | 'home' | 'isLoading'>;

jest.mock(
  '../../apis/installationInventory/useInstallationInventory',
  () => ({
    useInstallationInventory: () => ({
      ...mockInventory,
      isProbing: false,
      installationsWith: () => [],
      refresh: () => {},
    }),
  }),
);

function entry(
  installation: string,
  overrides: Partial<InstallationInventoryEntry> = {},
): InstallationInventoryEntry {
  return {
    installation,
    home: false,
    accessState: 'healthy',
    probe: 'answered',
    components: { kagent: true, muster: true, kserve: false, capi: true },
    ...overrides,
  };
}

const golem = entry('golem', { home: true });
const wombat = entry('wombat', {
  components: { kagent: false, muster: true, kserve: false, capi: true },
});
const snail = entry('snail', { accessState: 'session-expired' });

function configure(names: string[]) {
  setInstallationsConfig(names.map(name => ({ name })));
}

function renderSelect(
  props: Parameters<typeof InstallationScopeSelect>[0] = {},
  url = '/agent-platform/agents',
) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <InstallationScopeSelect {...props} />
    </MemoryRouter>,
  );
}

const trigger = () => screen.getByRole('button', { name: /installation scope/i });

describe('InstallationScopeSelect', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetInstallationScopeForTests();
    __resetInstallationsConfigForTests();
    mockInventory = { entries: [golem, wombat, snail], home: 'golem', isLoading: false };
    configure(['golem', 'wombat', 'snail']);
  });

  it('renders nothing on a portal that knows one installation', () => {
    configure(['golem']);
    mockInventory = { entries: [golem], home: 'golem', isLoading: false };

    const { container } = renderSelect();

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing until the installations config is known', () => {
    __resetInstallationsConfigForTests();
    mockInventory = { entries: [], home: undefined, isLoading: true };

    const { container } = renderSelect();

    expect(container).toBeEmptyDOMElement();
  });

  it('offers all installations and every platform installation with its state', async () => {
    renderSelect({ component: 'kagent' });

    expect(trigger()).toHaveTextContent('All installations');
    await userEvent.click(trigger());

    const options = screen.getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual([
      'All installations',
      'golem',
      'wombatno kagent here',
      'snailsigned out',
    ]);
  });

  it('prepends what the host knows about an installation', async () => {
    renderSelect({
      component: 'kagent',
      describe: e =>
        e.installation === 'golem' ? 'not reachable from this portal' : undefined,
    });

    await userEvent.click(trigger());

    expect(
      screen.getByRole('option', { name: /golem/ }),
    ).toHaveTextContent('golemnot reachable from this portal');
  });

  it('pins the chosen installation for the section and the URL', async () => {
    renderSelect();

    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('option', { name: /wombat/ }));

    expect(getInstallationScopeSnapshot().scope).toBe('wombat');
    expect(trigger()).toHaveTextContent('wombat');
  });

  it('shows the pinned installation from a deep link, and goes back to all', async () => {
    renderSelect({}, '/agent-platform/agents?installation=wombat');

    expect(trigger()).toHaveTextContent('wombat');

    await userEvent.click(trigger());
    await userEvent.click(
      screen.getByRole('option', { name: 'All installations' }),
    );

    expect(getInstallationScopeSnapshot().scope).toBe('all');
  });

  it('keeps an unknown pinned installation selectable and says it was not found', () => {
    setInstallationScope('nowhere');

    renderSelect();

    expect(trigger()).toHaveTextContent('nowhere');
  });
});
