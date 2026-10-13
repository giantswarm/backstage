import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TechnicalDetailsFoldOut } from './TechnicalDetailsFoldOut';

const trigger = () => screen.getByRole('button', { name: 'Technical details' });

function renderFoldOut(defaultExpanded: boolean) {
  return render(
    <TechnicalDetailsFoldOut defaultExpanded={defaultExpanded}>
      <p>The conditions</p>
    </TechnicalDetailsFoldOut>,
  );
}

describe('TechnicalDetailsFoldOut', () => {
  it('mounts its content only while open', async () => {
    renderFoldOut(false);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('The conditions')).toBeNull();

    await userEvent.click(trigger());
    expect(screen.getByText('The conditions')).toBeInTheDocument();
  });

  it('opens when a fresh read turns the resource unhealthy after the first render', () => {
    const { rerender } = renderFoldOut(false);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');

    rerender(
      <TechnicalDetailsFoldOut defaultExpanded>
        <p>The conditions</p>
      </TechnicalDetailsFoldOut>,
    );
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('The conditions')).toBeInTheDocument();
  });

  it('leaves the open state alone when the resource turns healthy', () => {
    const { rerender } = renderFoldOut(true);

    rerender(
      <TechnicalDetailsFoldOut defaultExpanded={false}>
        <p>The conditions</p>
      </TechnicalDetailsFoldOut>,
    );
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });
});
