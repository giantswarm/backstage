import { render, screen } from '@testing-library/react';
import {
  MusterInstance,
  MusterInstanceContext,
} from '../MusterInstanceProvider';
import {
  ActiveInstallationNote,
  describeActiveInstallation,
} from './ActiveInstallationNote';

function instance(overrides: Partial<MusterInstance> = {}): MusterInstance {
  return {
    installations: ['gazelle', 'golem'],
    installationInfos: [
      { name: 'gazelle', requiresAuth: true },
      { name: 'golem', requiresAuth: true },
    ],
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    scope: 'gazelle',
    homeInstallation: 'gazelle',
    isSingleInstallation: false,
    activeInstallationInfo: { name: 'gazelle', requiresAuth: true },
    setActiveInstallation: jest.fn(),
    mcpServers: [],
    workflows: [],
    isLoading: false,
    retry: jest.fn(),
    refreshInventory: jest.fn(),
    ...overrides,
  };
}

describe('describeActiveInstallation', () => {
  it('says nothing when the header pins the muster shown', () => {
    expect(describeActiveInstallation(instance())).toBeUndefined();
    expect(
      describeActiveInstallation(
        instance({ scope: 'golem', activeInstallation: 'golem' }),
      ),
    ).toBeUndefined();
  });

  it('names the one muster shown under "All installations", and that it is the home', () => {
    expect(describeActiveInstallation(instance({ scope: 'all' }))).toBe(
      'This shows one muster at a time, currently gazelle (home). Pin another environment in the page header.',
    );
  });

  it('does not call the muster shown the home when it is not', () => {
    // A portal whose home runs no muster: the first muster installation is shown.
    expect(
      describeActiveInstallation(
        instance({
          scope: 'all',
          activeInstallation: 'golem',
          homeInstallation: 'gazelle',
        }),
      ),
    ).toBe(
      'This shows one muster at a time, currently golem. Pin another environment in the page header.',
    );
  });

  it('explains a pinned installation that resolved to another muster', () => {
    // snail runs no muster (or the portal does not know it): the section fell
    // back to the home muster while the header still says snail.
    expect(describeActiveInstallation(instance({ scope: 'snail' }))).toBe(
      'There is no muster on snail, so this shows gazelle.',
    );
  });

  it('says nothing while loading, without a muster, or on a single-installation portal', () => {
    expect(
      describeActiveInstallation(
        instance({ scope: 'all', isLoadingInstallations: true }),
      ),
    ).toBeUndefined();
    expect(
      describeActiveInstallation(
        instance({ scope: 'all', activeInstallation: undefined }),
      ),
    ).toBeUndefined();
    // The header renders no selector there, so there is nothing to relate to.
    expect(
      describeActiveInstallation(
        instance({ scope: 'all', isSingleInstallation: true }),
      ),
    ).toBeUndefined();
  });
});

describe('ActiveInstallationNote', () => {
  it('renders the note as secondary text, and nothing when there is none', () => {
    const { container, rerender } = render(
      <MusterInstanceContext.Provider value={instance({ scope: 'all' })}>
        <ActiveInstallationNote />
      </MusterInstanceContext.Provider>,
    );
    expect(
      screen.getByText(/This shows one muster at a time, currently gazelle/),
    ).toBeInTheDocument();

    rerender(
      <MusterInstanceContext.Provider value={instance()}>
        <ActiveInstallationNote />
      </MusterInstanceContext.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
