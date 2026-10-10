import { useMemo } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PageHeaderActionsProvider,
  useProvidePageHeaderActions,
} from '../PageHeaderActions';
import { WizardFrame } from './WizardFrame';
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

function renderFrame(props: { onBack?: () => void } = {}) {
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
});
