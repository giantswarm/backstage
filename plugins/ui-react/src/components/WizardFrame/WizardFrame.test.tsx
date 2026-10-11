import { useMemo } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PageHeaderActionsProvider,
  useProvidePageHeaderActions,
} from '../PageHeaderActions';
import { TWO_COLUMN_MEDIA } from '../../utils/breakpoints';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '../../utils/mockPhoneLayout';
import {
  useWizardFrameAside,
  useWizardFrameRail,
  WizardFrame,
} from './WizardFrame';
import { WizardStepHeading } from './WizardStepHeading';

const steps = [
  { id: 'basics', label: 'Basics', href: '/agents/new' },
  { id: 'skills', label: 'Skills', href: '/agents/new/skills' },
  { id: 'tools', label: 'Connectors', href: '/agents/new/tools' },
  { id: 'review', label: 'Review' },
];

function ContinueAction() {
  const actions = useMemo(() => <button>Continue</button>, []);
  useProvidePageHeaderActions(actions);
  return null;
}

// Deliberately NOT memoized: a fresh element every render. The frame renders
// the slot in an isolated child, so a registering step inside it must not
// re-render when the slot updates — otherwise this would re-register forever.
function UnstableAction() {
  useProvidePageHeaderActions(<button>Unstable</button>);
  return null;
}

function renderFrame(
  props: { onBack?: () => void; confirmDiscard?: boolean } = {},
) {
  return render(
    <MemoryRouter initialEntries={['/agents/new/tools']}>
      <PageHeaderActionsProvider>
        <Routes>
          <Route
            path="/agents/new/tools"
            element={
              <WizardFrame
                title="New agent"
                context="Customize / Agents"
                steps={steps}
                currentStep="tools"
                closeHref="/customize/agents"
                {...props}
              >
                <WizardStepHeading title="Choose individual tools" />
                <ContinueAction />
              </WizardFrame>
            }
          />
          <Route path="/customize/agents" element={<p>Customize page</p>} />
        </Routes>
      </PageHeaderActionsProvider>
    </MemoryRouter>,
  );
}

describe('WizardFrame', () => {
  it('titles the flow with its h1 and the step content below', () => {
    renderFrame();

    expect(
      screen.getByRole('heading', { level: 1, name: 'New agent' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Customize / Agents')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Choose individual tools',
      }),
    ).toBeInTheDocument();
  });

  it('nests in the content area instead of covering the viewport', () => {
    const { container } = renderFrame();

    const frame = container.querySelector('div')!;
    // In-content: a normal flow element, not a fixed overlay — the shell's
    // rail (and the classic chrome) stay visible and usable around it.
    expect(frame.className).not.toMatch(/fixed/i);
    const { position } = getComputedStyle(frame);
    expect(position === 'static' || position === 'relative').toBe(true);
  });

  it('keeps the action bar at the bottom of the view, above the shell’s mobile bar', () => {
    const { container } = renderFrame();

    const frame = container.querySelector('div')!;
    // At least a viewport tall, so a short step still has its footer at the
    // bottom of the view rather than right under the last field.
    expect(getComputedStyle(frame).minHeight).toBe(
      'calc(100dvh - var(--agent-shell-mobile-bar-height, 0px))',
    );
    // Docked there while a long step scrolls behind it: after the content in
    // the flow (so it never covers the last field), sticky to the bottom.
    const footer = screen.getByRole('contentinfo');
    expect(frame.lastElementChild).toBe(footer);
    const style = getComputedStyle(footer);
    expect(style.position).toBe('sticky');
    expect(style.bottom).toBe('var(--agent-shell-mobile-bar-height, 0px)');
  });

  it('marks the current step and links the steps already done', () => {
    renderFrame();

    const strip = screen.getByRole('list', { name: 'Steps' });
    const items = within(strip).getAllByRole('listitem');
    expect(items.map(item => item.textContent)).toEqual([
      'Basics',
      'Skills',
      '3Connectors',
      '4Review',
    ]);
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(within(strip).getByRole('link', { name: 'Basics' })).toHaveAttribute(
      'href',
      '/agents/new',
    );
    expect(
      within(strip).queryByRole('link', { name: /Review/ }),
    ).not.toBeInTheDocument();
  });

  it('closes and cancels to the close href', () => {
    renderFrame();

    expect(screen.getByRole('link', { name: 'Close' })).toHaveAttribute(
      'href',
      '/customize/agents',
    );
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/customize/agents',
    );
  });

  it.each(['Close', 'Cancel'])(
    'asks before %s discards a dirty flow, and stays on Keep editing',
    async name => {
      renderFrame({ confirmDiscard: true });

      await userEvent.click(screen.getByRole('link', { name }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('Discard your changes?');
      expect(dialog).toHaveTextContent('What you entered will not be saved.');

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Keep editing' }),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 1, name: 'New agent' }),
      ).toBeInTheDocument();
    },
  );

  it('leaves to the close href on Discard changes', async () => {
    renderFrame({ confirmDiscard: true });

    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Discard changes',
      }),
    );

    expect(await screen.findByText('Customize page')).toBeInTheDocument();
  });

  it('renders Back when it can go back, then the step’s registered buttons', async () => {
    const onBack = jest.fn();
    renderFrame({ onBack });

    const footer = screen.getByRole('contentinfo');
    expect(
      within(footer)
        .getAllByRole('button')
        .map(button => button.textContent),
    ).toEqual(['Back', 'Continue']);
    await userEvent.click(within(footer).getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders a step’s non-memoized actions without looping', () => {
    render(
      <MemoryRouter>
        <PageHeaderActionsProvider>
          <WizardFrame title="New agent" closeHref="/customize/agents">
            <UnstableAction />
          </WizardFrame>
        </PageHeaderActionsProvider>
      </MemoryRouter>,
    );

    const footer = screen.getByRole('contentinfo');
    expect(
      within(footer).getByRole('button', { name: 'Unstable' }),
    ).toBeInTheDocument();
  });

  it('has no Back button without onBack', () => {
    renderFrame();

    expect(
      screen.queryByRole('button', { name: 'Back' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the scroll clearance in step with the footer’s measured height', () => {
    renderFrame();

    // Until measured, the clearance assumes the one-row footer's 64px.
    const styles = Array.from(document.querySelectorAll('style'))
      .map(style => style.textContent)
      .join('\n');
    expect(styles).toContain(
      'scroll-margin-bottom: calc(var(--wizard-footer-height, 64px) + 32px + var(--agent-shell-mobile-bar-height, 0px))',
    );
  });

  it('widens its padding at the two-column tier, not at a breakpoint of its own', () => {
    renderFrame();

    const styles = Array.from(document.querySelectorAll('style'))
      .map(style => style.textContent)
      .join('\n');
    expect(styles).toContain(TWO_COLUMN_MEDIA);
    expect(styles).not.toMatch(/max-width: 720px/);
  });

  describe('at phone width', () => {
    let layout: MockedLayout;
    beforeEach(() => {
      layout = mockPhoneLayout();
    });
    afterEach(() => layout.restore());

    it('says which step of how many, and keeps the labelled list for assistive technology', () => {
      renderFrame();

      expect(screen.getByText('Step 3 of 4 · Connectors')).toBeInTheDocument();
      // The list the e2e helper and screen readers read is still there, with
      // the current step marked — visually hidden, and without links no one
      // can see.
      const strip = screen.getByRole('list', { name: 'Steps' });
      const items = within(strip).getAllByRole('listitem');
      expect(items).toHaveLength(4);
      expect(items[2]).toHaveAttribute('aria-current', 'step');
      expect(within(strip).queryByRole('link')).not.toBeInTheDocument();
    });

    it('turns Back into an icon so the footer keeps to one row', async () => {
      const onBack = jest.fn();
      renderFrame({ onBack });

      const footer = screen.getByRole('contentinfo');
      const back = within(footer).getByRole('button', { name: 'Back' });
      expect(back).not.toHaveTextContent('Back');
      await userEvent.click(back);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('goes back to the full step strip on a wider screen', () => {
      renderFrame();

      act(() => layout.setWidth(1280));
      expect(
        screen.queryByText('Step 3 of 4 · Connectors'),
      ).not.toBeInTheDocument();
      expect(
        within(screen.getByRole('list', { name: 'Steps' })).getByRole('link', {
          name: 'Basics',
        }),
      ).toBeInTheDocument();
    });
  });

  describe('a docked side panel', () => {
    function Aside({ width, active }: { width: number; active: boolean }) {
      const { docked } = useWizardFrameAside(width, active);
      return <p>{docked ? 'docked' : 'covering'}</p>;
    }

    it('is docked outside a measured frame, and reserves nothing while inactive', () => {
      const { container } = render(
        <MemoryRouter>
          <PageHeaderActionsProvider>
            <WizardFrame title="New agent" closeHref="/customize/agents">
              <Aside width={420} active={false} />
            </WizardFrame>
          </PageHeaderActionsProvider>
        </MemoryRouter>,
      );

      expect(screen.getByText('docked')).toBeInTheDocument();
      const frame = container.querySelector(
        '[data-field-validation-scope]',
      ) as HTMLElement;
      expect(frame.style.paddingRight).toBe('');
    });

    it('reserves its width on the frame while active, and releases it', () => {
      const { container, rerender } = render(
        <MemoryRouter>
          <PageHeaderActionsProvider>
            <WizardFrame title="New agent" closeHref="/customize/agents">
              <Aside width={420} active />
            </WizardFrame>
          </PageHeaderActionsProvider>
        </MemoryRouter>,
      );
      const frame = container.querySelector(
        '[data-field-validation-scope]',
      ) as HTMLElement;
      expect(frame.style.paddingRight).toBe('420px');

      rerender(
        <MemoryRouter>
          <PageHeaderActionsProvider>
            <WizardFrame title="New agent" closeHref="/customize/agents">
              <Aside width={420} active={false} />
            </WizardFrame>
          </PageHeaderActionsProvider>
        </MemoryRouter>,
      );
      expect(frame.style.paddingRight).toBe('');
    });
  });

  describe('a rail', () => {
    function Step() {
      const { docked } = useWizardFrameRail();
      return <p>{docked ? 'rail docked' : 'narrow fallback'}</p>;
    }

    function renderWithRail() {
      return render(
        <MemoryRouter>
          <PageHeaderActionsProvider>
            <WizardFrame
              title="New agent"
              closeHref="/customize/agents"
              rail={<aside aria-label="Selected">3 tools</aside>}
            >
              <Step />
            </WizardFrame>
          </PageHeaderActionsProvider>
        </MemoryRouter>,
      );
    }

    let layout: MockedLayout | undefined;
    afterEach(() => {
      layout?.restore();
      layout = undefined;
    });

    it('docks beside the step at the two-column tier', () => {
      layout = mockDesktopLayout();
      renderWithRail();

      expect(
        screen.getByRole('complementary', { name: 'Selected' }),
      ).toHaveTextContent('3 tools');
      expect(screen.getByText('rail docked')).toBeInTheDocument();
    });

    it('is left to the step’s fallback below it, and comes back on a wider screen', () => {
      layout = mockPhoneLayout();
      renderWithRail();

      expect(
        screen.queryByRole('complementary', { name: 'Selected' }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('narrow fallback')).toBeInTheDocument();

      act(() => layout!.setWidth(1280));
      expect(
        screen.getByRole('complementary', { name: 'Selected' }),
      ).toBeInTheDocument();
    });

    it('answers no rail outside a frame', () => {
      render(<Step />);
      expect(screen.getByText('narrow fallback')).toBeInTheDocument();
    });
  });
});
