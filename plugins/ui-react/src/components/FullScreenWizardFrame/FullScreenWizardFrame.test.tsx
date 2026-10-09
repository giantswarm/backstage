import { useMemo } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PageHeaderActionsProvider,
  useProvidePageHeaderActions,
} from '../PageHeaderActions';
import { FullScreenWizardFrame } from './FullScreenWizardFrame';

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

function renderFrame(props: { onBack?: () => void } = {}) {
  return render(
    <MemoryRouter initialEntries={['/agents/new/tools']}>
      <PageHeaderActionsProvider>
        <Routes>
          <Route
            path="/agents/new/tools"
            element={
              <FullScreenWizardFrame
                title="New agent"
                context="Customize / Agents"
                steps={steps}
                currentStep="tools"
                closeHref="/customize/agents"
                {...props}
              >
                <h2>Choose individual tools</h2>
                <ContinueAction />
                <div role="dialog" aria-label="Picker">
                  <input aria-label="Filter" />
                </div>
              </FullScreenWizardFrame>
            }
          />
          <Route path="/customize/agents" element={<p>Customize page</p>} />
        </Routes>
      </PageHeaderActionsProvider>
    </MemoryRouter>,
  );
}

describe('FullScreenWizardFrame', () => {
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

  it('has no Back button without onBack', () => {
    renderFrame();

    expect(
      screen.queryByRole('button', { name: 'Back' }),
    ).not.toBeInTheDocument();
  });

  it('leaves on Escape', async () => {
    renderFrame();

    await userEvent.keyboard('{Escape}');

    expect(screen.getByText('Customize page')).toBeInTheDocument();
  });

  it('stays when Escape is pressed inside a dialog', async () => {
    renderFrame();

    await userEvent.click(screen.getByRole('textbox', { name: 'Filter' }));
    await userEvent.keyboard('{Escape}');

    expect(
      screen.getByRole('heading', { level: 1, name: 'New agent' }),
    ).toBeInTheDocument();
  });
});
