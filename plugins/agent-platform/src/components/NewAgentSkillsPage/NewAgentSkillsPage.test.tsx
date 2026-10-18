import { ReactNode, useEffect } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { act, screen, within } from '@testing-library/react';
import userEvent, {
  PointerEventsCheckLevel,
} from '@testing-library/user-event';

import { agentsRouteRef } from '../../routes';
import { canonicalSkillId, type DiscoveredSkill } from '../../lib/skills';
import type { DiscoveredPlugin } from '../../lib/plugins';
import type { HarnessChoice } from '../../lib/harnesses';
import { NewAgentFormProvider, useNewAgentForm } from '../NewAgentFormProvider';
import { NewAgentSkillsPage } from './NewAgentSkillsPage';

// Header actions land in the shared plugin header, outside this tree; the page
// renders the same actions in its footer card.
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  useProvidePageHeaderActions: jest.fn(),
}));

const HEAD = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';
const OTHER = '9f2c1a7e0b4d6c8a2e1f3b5d7c9a1b3d5e7f9a1b';

const SKILLS: DiscoveredSkill[] = [
  {
    name: 'Incident responder',
    description: 'Triage an incident.',
    repoUrl: 'https://github.com/giantswarm/agent-skills',
    path: 'incident',
    ref: 'main',
    commit: HEAD,
  },
  {
    name: 'PR review',
    description: 'Review pull requests.',
    repoUrl: 'https://github.com/giantswarm/claude-code',
    path: 'plugins/gs-base/skills/pr-review',
    ref: 'master',
    commit: OTHER,
  },
];

const PLUGINS: DiscoveredPlugin[] = [
  {
    name: 'review-kit',
    description: 'Review helpers.',
    repoUrl: 'https://github.com/acme/plugins',
    path: 'kit',
    ref: 'main',
    commit: HEAD,
    format: 'agent-plugins',
    skills: [
      { name: 'lint', description: '' },
      { name: 'docs', description: '' },
    ],
  },
  {
    name: 'commit-commands',
    description: 'Git commit commands.',
    repoUrl: 'https://github.com/anthropics/claude-code',
    path: 'plugins/commit-commands',
    ref: 'main',
    commit: OTHER,
    format: 'claude',
    skills: [],
  },
];

const RESOLVED = {
  skills: SKILLS,
  plugins: [] as DiscoveredPlugin[],
  isLoading: false,
  error: null,
  hasRepositories: true,
  failedRepositories: [],
  truncated: false,
};

// Mutable so a test can flip it to loading. The `mock` prefix is what lets
// jest.mock's factory reference it.
const mockCatalog = { ...RESOLVED };

jest.mock('../../hooks/useSkillCatalog', () => ({
  useSkillCatalog: () => mockCatalog,
}));

// The agents the Usage filter reads: rows carry the canonical ids of the
// skills they mount. Loaded and empty unless a test says otherwise.
const mockAgents: {
  rows: { skillIds?: string[] }[];
  isLoading: boolean;
} = { rows: [], isLoading: false };

jest.mock('../AgentsDataProvider', () => ({
  ...jest.requireActual('../AgentsDataProvider'),
  AgentsDataProvider: ({ children }: { children: ReactNode }) => children,
  useAgents: () => mockAgents,
}));

jest.mock('../ModelConfigsProvider', () => ({
  ...jest.requireActual('../ModelConfigsProvider'),
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => children,
}));

beforeEach(() => {
  Object.assign(mockCatalog, RESOLVED);
  Object.assign(mockAgents, { rows: [], isLoading: false });
});

/** A filter's dropdown; `hidden` keeps it readable while its list is open. */
function filterDropdown(field: string) {
  return screen.getByRole('button', {
    name: new RegExp(`Filter by ${field}`),
    hidden: true,
  });
}

/** A filter dropdown's options, as "label count", read and closed again. */
async function filterOptions(field: string) {
  await userEvent.click(filterDropdown(field));
  const options = within(await screen.findByRole('listbox'))
    .getAllByRole('option')
    .map(option => option.textContent);
  await userEvent.keyboard('{Escape}');
  return options;
}

/** Toggles one option of a filter dropdown. */
async function pickFilter(field: string, option: string) {
  await userEvent.click(filterDropdown(field));
  await userEvent.click(await screen.findByRole('option', { name: option }));
  await userEvent.keyboard('{Escape}');
}

/** The Harness step 1 picked; undefined is the platform Harness. */
let seedHarness: HarnessChoice | undefined;

/** Fills the step-1 fields the skills step requires, then renders its child. */
function Seed({ children }: { children: ReactNode }) {
  const {
    setName,
    setInstallation,
    selectModelConfig,
    selectHarness,
    isComplete,
  } = useNewAgentForm();
  useEffect(() => {
    setName('Reviewer');
    setInstallation('gazelle');
    selectModelConfig('opus', 'kagent');
    if (seedHarness) {
      selectHarness(seedHarness);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return isComplete ? <>{children}</> : null;
}

/** Exposes the selected skills' pins for assertions on the step's output. */
function SelectionProbe() {
  const { state } = useNewAgentForm();
  return (
    <>
      <output data-testid="selection">
        {state.selectedSkills
          .map(skill => `${skill.path}@${skill.commit}`)
          .join(' | ')}
      </output>
      <output data-testid="plugins">{JSON.stringify(state.plugins)}</output>
    </>
  );
}

function pluginsOfForm() {
  return JSON.parse(screen.getByTestId('plugins').textContent ?? '[]');
}

async function renderStep() {
  return renderInTestApp(
    <NewAgentFormProvider>
      <Seed>
        <NewAgentSkillsPage />
        <SelectionProbe />
      </Seed>
    </NewAgentFormProvider>,
    { mountedRoutes: { '/customize/agents': agentsRouteRef } },
  );
}

describe('NewAgentSkillsPage plugins', () => {
  beforeEach(() => {
    Object.assign(mockCatalog, { plugins: PLUGINS });
    seedHarness = { name: 'claude', runtime: 'claude' };
  });

  afterEach(() => {
    seedHarness = undefined;
  });

  it('offers a Claude Code plugin on the platform Harness disabled, and says why', async () => {
    seedHarness = undefined;
    const user = userEvent.setup();
    await renderStep();

    const card = await screen.findByRole('checkbox', {
      name: 'Plugin commit-commands',
    });
    expect(card).toHaveAttribute('aria-disabled', 'true');
    expect(card).toHaveTextContent(
      'Loads on a Claude Code runtime only; this agent runs on Declarative (Go ADK).',
    );
    await user.click(card);
    expect(pluginsOfForm()).toEqual([]);
    // An Agent Plugins package loads on every runtime.
    expect(
      screen.getByRole('checkbox', { name: 'Plugin review-kit' }),
    ).not.toHaveAttribute('aria-disabled');
  });

  it('titles the step for skills and plugins and says what each format does', async () => {
    await renderStep();

    expect(
      await screen.findByRole('heading', { name: 'Select skills and plugins' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Plugin commit-commands' }),
    ).toHaveTextContent(/loads whole/);
    expect(
      screen.getByRole('checkbox', { name: 'Plugin review-kit' }),
    ).toHaveTextContent(/enables only the skills you select/);
  });

  it('pins a Claude Code plugin to the commit shown, with no selection', async () => {
    const user = userEvent.setup();
    await renderStep();

    await user.click(
      await screen.findByRole('checkbox', { name: 'Plugin commit-commands' }),
    );

    expect(pluginsOfForm()).toEqual([
      {
        path: 'plugins/commit-commands',
        git: {
          url: 'https://github.com/anthropics/claude-code',
          commit: OTHER,
        },
      },
    ]);
    // Nothing to select in a plugin that loads whole.
    expect(screen.queryByRole('group', { name: /Skills of/ })).toBeNull();
  });

  it('starts an Agent Plugins package with every skill enabled, and unchecks one', async () => {
    const user = userEvent.setup();
    await renderStep();

    await user.click(
      await screen.findByRole('checkbox', { name: 'Plugin review-kit' }),
    );
    expect(pluginsOfForm()).toEqual([
      {
        path: 'kit',
        git: { url: 'https://github.com/acme/plugins', commit: HEAD },
        skills: ['lint', 'docs'],
      },
    ]);

    const skills = screen.getByRole('group', { name: /Skills of review-kit/ });
    await user.click(within(skills).getByRole('checkbox', { name: 'lint' }));
    expect(pluginsOfForm()[0].skills).toEqual(['docs']);

    // Unchecking the last one leaves the plugin without a selection.
    await user.click(within(skills).getByRole('checkbox', { name: 'docs' }));
    expect(pluginsOfForm()[0].skills).toBeUndefined();

    // Unpicking the plugin drops its entry.
    await user.click(
      screen.getByRole('checkbox', { name: 'Plugin review-kit' }),
    );
    expect(pluginsOfForm()).toEqual([]);
  });

  it('refuses to continue while a skill name is enabled twice', async () => {
    Object.assign(mockCatalog, {
      skills: [{ ...SKILLS[0], name: 'lint', path: 'lint' }],
    });
    const user = userEvent.setup();
    await renderStep();

    await user.click(
      await screen.findByRole('checkbox', { name: 'Skill lint' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Plugin review-kit' }),
    );
    // A name already taken is not preselected.
    expect(pluginsOfForm()[0].skills).toEqual(['docs']);

    const skills = screen.getByRole('group', { name: /Skills of review-kit/ });
    await user.click(within(skills).getByRole('checkbox', { name: 'lint' }));
    expect(
      screen.getByText(
        /enables the skill lint, which the skill lint already provides/,
      ),
    ).toBeInTheDocument();
  });
});

describe('NewAgentSkillsPage', () => {
  it('shows the commit each skill is pinned to, next to its branch', async () => {
    await renderStep();

    const incident = await screen.findByRole('checkbox', {
      name: 'Skill Incident responder',
    });
    expect(incident).toHaveTextContent('main @cb1fb76');
    expect(
      screen.getByLabelText('Pinned to commit cb1fb76 of main'),
    ).toBeInTheDocument();

    const review = screen.getByRole('checkbox', { name: 'Skill PR review' });
    expect(review).toHaveTextContent('master @9f2c1a7');
  });

  it('carries the full commit into the form model when a skill is picked', async () => {
    const user = userEvent.setup();
    await renderStep();

    await user.click(
      await screen.findByRole('checkbox', { name: 'Skill Incident responder' }),
    );

    expect(screen.getByTestId('selection')).toHaveTextContent(
      `incident@${HEAD}`,
    );
    // A branch name is never what is selected.
    expect(screen.getByTestId('selection')).not.toHaveTextContent('main');
    // At two skills every card shows its own state; no count above them.
    expect(
      screen.getByRole('checkbox', { name: 'Skill Incident responder' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it('shows a progress bar while the catalogue is being discovered', async () => {
    Object.assign(mockCatalog, { skills: [], isLoading: true });
    await renderStep();

    expect(await screen.findByText('Discovering skills…')).toBeInTheDocument();
    // `Progress` renders a hidden placeholder for its first 250ms, so the bar
    // itself is what has to be waited for -- a `progress` test id matches either.
    expect(
      await screen.findByRole('progressbar', { name: 'Discovering skills…' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('leaves a description that fits alone', async () => {
    await renderStep();

    await screen.findByRole('checkbox', { name: 'Skill Incident responder' });
    expect(
      screen.queryByRole('button', { name: /Show more of/ }),
    ).not.toBeInTheDocument();
  });

  describe('when a description is cut off by the clamp', () => {
    // The shim in setupTests is a no-op, so nothing would ever be re-measured.
    // A controllable one lets a test do what a browser does when the clamp is
    // lifted and the paragraph changes height.
    const resizeCallbacks = new Set<(entries: ResizeObserverEntry[]) => void>();
    // With an (empty) entry list, as a browser calls them: react-aria's own
    // observers (the filter dropdowns') read it.
    const flushResizeObservers = () =>
      act(() => {
        resizeCallbacks.forEach(callback => callback([]));
      });
    const RealResizeObserver = globalThis.ResizeObserver;

    beforeEach(() => {
      globalThis.ResizeObserver = class {
        constructor(
          private readonly callback: (entries: ResizeObserverEntry[]) => void,
        ) {}
        observe() {
          resizeCallbacks.add(this.callback);
        }
        unobserve() {}
        disconnect() {
          resizeCallbacks.delete(this.callback);
        }
      } as unknown as typeof ResizeObserver;
    });

    afterEach(() => {
      resizeCallbacks.clear();
      globalThis.ResizeObserver = RealResizeObserver;
    });

    // jsdom lays nothing out, so the measurement `useIsTruncated` makes always
    // comes back "fits". Overflow is what the toggle exists for. Only a clamped
    // element overflows, which is what makes expanding measurable: it is the
    // state the toggle has to survive to still be there for *Show less*.
    beforeEach(() => {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get(this: HTMLElement) {
          const className = this.getAttribute('class') ?? '';
          return className.includes('clamped') ? 120 : 40;
        },
      });
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        value: 40,
      });
    });

    afterEach(() => {
      // @ts-expect-error -- restores jsdom's own getter on Element.prototype.
      delete HTMLElement.prototype.scrollHeight;
      // @ts-expect-error -- ditto.
      delete HTMLElement.prototype.clientHeight;
    });

    it("reveals the rest on click, from outside the card's checkbox", async () => {
      // The toggle is `pointer-events: none` until its card is hovered, and
      // jsdom applies no `:hover` state -- so the check has to come off, or
      // every click on it is refused for a reason that only exists in the test.
      const user = userEvent.setup({
        pointerEventsCheck: PointerEventsCheckLevel.Never,
      });
      await renderStep();

      const toggle = await screen.findByRole('button', {
        name: 'Show more of Incident responder',
      });
      // A control inside the checkbox would be invalid markup, and
      // role="checkbox" would make it presentational to assistive tech.
      const card = screen.getByRole('checkbox', {
        name: 'Skill Incident responder',
      });
      expect(card).not.toContainElement(toggle);

      await user.click(toggle);
      // What the browser does next: the text is no longer clamped, so the
      // paragraph grows and measures as fitting.
      flushResizeObservers();

      const collapse = await screen.findByRole('button', {
        name: 'Show less of Incident responder',
      });
      expect(collapse).toHaveAttribute('aria-expanded', 'true');
      // Revealing a description must not select the skill.
      expect(screen.getByTestId('selection')).toHaveTextContent('');

      // The toggle has to survive that measurement, or it is pulled out from
      // under the pointer -- and from under the keyboard focus that is on it --
      // until the clamp is back and the observer has fired again.
      await user.click(collapse);

      expect(
        await screen.findByRole('button', {
          name: 'Show more of Incident responder',
        }),
      ).toBeInTheDocument();
    });

    it("points the card's description at the text it describes", async () => {
      await renderStep();

      const card = await screen.findByRole('checkbox', {
        name: 'Skill Incident responder',
      });
      const describedBy = card.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!)).toHaveTextContent(
        'Triage an incident.',
      );
    });
  });

  describe('at the scale of the catalogue', () => {
    const REPO_A = 'https://github.com/giantswarm/agent-skills';
    const REPO_B = 'https://github.com/giantswarm/claude-code';
    const REPO_C = 'https://github.com/giantswarm/more-skills';

    /** `count` loose skills in `repoUrl`, named `<prefix> 001` and on. */
    const skillsIn = (repoUrl: string, count: number, prefix: string) =>
      Array.from({ length: count }, (_, i): DiscoveredSkill => ({
        name: `${prefix} ${String(i + 1).padStart(3, '0')}`,
        description: `Skill number ${i + 1}.`,
        repoUrl,
        path: `${prefix.toLowerCase()}-${i + 1}`,
        ref: 'main',
        commit: HEAD,
      }));

    it('shows three skills of one repository as a plain grid', async () => {
      Object.assign(mockCatalog, { skills: skillsIn(REPO_A, 3, 'Alpha') });
      await renderStep();

      expect(
        await screen.findAllByRole('checkbox', { name: /^Skill Alpha/ }),
      ).toHaveLength(3);
      // No search, no count, no accordion around the only repository, and
      // no paging chrome.
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
      expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /agent-skills/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^Show \d+ more/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/skills shown/)).not.toBeInTheDocument();
    });

    it('opens every repository of a short catalogue', async () => {
      await renderStep();

      // Two repositories, two skills: both open, both cards on screen.
      expect(
        await screen.findByRole('checkbox', {
          name: 'Skill Incident responder',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('checkbox', { name: 'Skill PR review' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    });

    it('windows 300 skills of one repository, with search', async () => {
      const user = userEvent.setup();
      Object.assign(mockCatalog, { skills: skillsIn(REPO_A, 300, 'Alpha') });
      await renderStep();

      expect(
        await screen.findAllByRole('checkbox', { name: /^Skill Alpha/ }),
      ).toHaveLength(20);
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
      expect(screen.getByText('0 selected')).toBeInTheDocument();
      // Still flat: one repository needs no accordion, however long.
      expect(
        screen.queryByRole('button', { name: /agent-skills/ }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('20 skills shown, 280 more')).toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: 'Show 20 more skills' }),
      );
      expect(
        screen.getAllByRole('checkbox', { name: /^Skill Alpha/ }),
      ).toHaveLength(40);

      // A search starts the matches at their first page.
      await user.type(screen.getByRole('searchbox'), 'Alpha 25');
      expect(
        screen.getByRole('checkbox', { name: 'Skill Alpha 250' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('checkbox', { name: 'Skill Alpha 001' }),
      ).not.toBeInTheDocument();
    });

    it('opens 300 skills across repositories as their counts', async () => {
      const user = userEvent.setup();
      Object.assign(mockCatalog, {
        skills: [
          ...skillsIn(REPO_A, 100, 'Alpha'),
          ...skillsIn(REPO_B, 100, 'Beta'),
          ...skillsIn(REPO_C, 100, 'Gamma'),
        ],
      });
      await renderStep();

      const alpha = await screen.findByRole('button', {
        name: /giantswarm\/agent-skills \(100\)/,
      });
      expect(
        screen.getByRole('button', { name: /giantswarm\/claude-code \(100\)/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /giantswarm\/more-skills \(100\)/ }),
      ).toBeInTheDocument();
      // Collapsed, and a collapsed repository mounts none of its cards.
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.getByRole('searchbox')).toBeInTheDocument();

      // Opening one shows its first page only.
      await user.click(alpha);
      expect(
        screen.getAllByRole('checkbox', { name: /^Skill Alpha/ }),
      ).toHaveLength(20);
      expect(
        screen.getByRole('button', { name: 'Show 20 more skills' }),
      ).toBeInTheDocument();

      // A pick is counted on the repository's trigger, so a collapsed one
      // still says it holds part of the selection.
      await user.click(
        screen.getByRole('checkbox', { name: 'Skill Alpha 001' }),
      );
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      await user.click(alpha);
      expect(
        screen.getByRole('button', {
          name: /giantswarm\/agent-skills \(100 · 1 selected\)/,
        }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

      // A search opens every repository it matched in.
      await user.type(screen.getByRole('searchbox'), 'Gamma 042');
      expect(
        await screen.findByRole('checkbox', { name: 'Skill Gamma 042' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /agent-skills/ }),
      ).not.toBeInTheDocument();
    });

    describe('filters, as on Customize → Skills (T49, T64)', () => {
      it('offers Source and Usage dropdowns over three unused skills of one repository', async () => {
        Object.assign(mockCatalog, { skills: skillsIn(REPO_A, 3, 'Alpha') });
        await renderStep();

        await screen.findAllByRole('checkbox', { name: /^Skill Alpha/ });
        // Always there, one option each (T64).
        expect(await filterOptions('source')).toEqual([
          'giantswarm/agent-skills 3',
        ]);
        expect(await filterOptions('usage')).toEqual(['Not used 3']);
        expect(
          screen.getAllByRole('checkbox', { name: /^Skill Alpha/ }),
        ).toHaveLength(3);
      });

      it('filters three skills by usage, without a search, and clears', async () => {
        const user = userEvent.setup();
        const skills = skillsIn(REPO_A, 3, 'Alpha');
        Object.assign(mockCatalog, { skills });
        Object.assign(mockAgents, {
          rows: [{ skillIds: [canonicalSkillId(skills[0])] }],
        });
        await renderStep();

        await screen.findAllByRole('checkbox', { name: /^Skill Alpha/ });
        expect(await filterOptions('usage')).toEqual([
          'Used by agents 1',
          'Not used 2',
        ]);
        // One repository: a Source dropdown of one option.
        expect(await filterOptions('source')).toEqual([
          'giantswarm/agent-skills 3',
        ]);
        expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();

        await user.click(
          screen.getByRole('checkbox', { name: 'Skill Alpha 001' }),
        );
        await pickFilter('usage', 'Not used 2');
        expect(
          screen.getAllByRole('checkbox', { name: /^Skill Alpha/ }),
        ).toHaveLength(2);
        // The pick is out of sight now, so the step says it is still there.
        expect(screen.getByText('1 selected')).toBeInTheDocument();
        expect(screen.getByTestId('selection')).toHaveTextContent('alpha-1@');

        await user.click(
          within(screen.getByRole('group', { name: 'Filters' })).getByRole(
            'button',
            { name: 'Clear filters' },
          ),
        );
        expect(
          screen.getAllByRole('checkbox', { name: /^Skill Alpha/ }),
        ).toHaveLength(3);
        expect(screen.getByTestId('selection')).toHaveTextContent('alpha-1@');
      });

      it('holds the Usage dropdown back while the agents load', async () => {
        Object.assign(mockAgents, { isLoading: true });
        await renderStep();

        await screen.findByRole('checkbox', { name: 'Skill PR review' });
        expect(await filterOptions('source')).toEqual([
          'giantswarm/agent-skills 1',
          'giantswarm/claude-code 1',
        ]);
        expect(
          screen.queryByRole('button', { name: /Filter by usage/ }),
        ).not.toBeInTheDocument();
      });

      it('narrows 300 skills across repositories by source and usage', async () => {
        const user = userEvent.setup();
        const skills = [
          ...skillsIn(REPO_A, 100, 'Alpha'),
          ...skillsIn(REPO_B, 100, 'Beta'),
          ...skillsIn(REPO_C, 100, 'Gamma'),
        ];
        Object.assign(mockCatalog, { skills });
        Object.assign(mockAgents, {
          rows: [{ skillIds: skills.slice(100, 130).map(canonicalSkillId) }],
        });
        await renderStep();

        await screen.findByRole('button', {
          name: /giantswarm\/agent-skills \(100\)/,
        });
        expect(await filterOptions('usage')).toEqual([
          'Used by agents 30',
          'Not used 270',
        ]);
        expect(await filterOptions('source')).toEqual([
          'giantswarm/agent-skills 100',
          'giantswarm/claude-code 100',
          'giantswarm/more-skills 100',
        ]);
        // Collapsed until something narrows the list.
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

        // A pick opens the repositories that hold a match, windowed.
        await pickFilter('usage', 'Used by agents 30');
        expect(
          screen.getByRole('button', {
            name: /giantswarm\/claude-code \(30\)/,
          }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: /agent-skills \(/ }),
        ).not.toBeInTheDocument();
        expect(
          screen.getAllByRole('checkbox', { name: /^Skill Beta/ }),
        ).toHaveLength(20);
        expect(
          screen.getByRole('button', { name: 'Show 10 more skills' }),
        ).toBeInTheDocument();
        // The source counts follow the usage pick.
        expect(await filterOptions('source')).toEqual([
          'giantswarm/agent-skills 0',
          'giantswarm/claude-code 30',
          'giantswarm/more-skills 0',
        ]);

        // Unused skills from two of the sources: any of them.
        await pickFilter('usage', 'Used by agents 30');
        await pickFilter('usage', 'Not used 270');
        await pickFilter('source', 'giantswarm/agent-skills 100');
        await pickFilter('source', 'giantswarm/more-skills 100');
        expect(
          screen.getByRole('button', {
            name: /giantswarm\/agent-skills \(100\)/,
          }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', {
            name: /giantswarm\/more-skills \(100\)/,
          }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: /claude-code \(/ }),
        ).not.toBeInTheDocument();

        // Search and filter together can empty the list; the way back is
        // offered.
        await user.type(screen.getByRole('searchbox'), 'Beta');
        expect(
          screen.getByText('No skills match “Beta” with these filters.'),
        ).toBeInTheDocument();
        const [, emptyStateClear] = screen.getAllByRole('button', {
          name: 'Clear filters',
        });
        await user.click(emptyStateClear);
        expect(
          screen.getAllByRole('checkbox', { name: /^Skill Beta/ }),
        ).toHaveLength(20);
      });
    });
  });

  it('says that skills stay on their pinned commit', async () => {
    await renderStep();
    expect(
      await screen.findByText(/pinned to the commit shown on its card/),
    ).toBeInTheDocument();
  });
});
