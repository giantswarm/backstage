import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TechnicalDetailsFoldOut } from './TechnicalDetailsFoldOut';

const trigger = () => screen.getByRole('button', { name: 'Technical details' });

function foldOut(defaultExpanded: boolean, follow?: boolean) {
  return (
    <TechnicalDetailsFoldOut
      defaultExpanded={defaultExpanded}
      followDefaultExpanded={follow}
    >
      <p>The conditions</p>
    </TechnicalDetailsFoldOut>
  );
}

function renderFoldOut(defaultExpanded: boolean, follow?: boolean) {
  return render(foldOut(defaultExpanded, follow));
}

describe('TechnicalDetailsFoldOut', () => {
  it('mounts its content only while open', async () => {
    renderFoldOut(false);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('The conditions')).toBeNull();

    await userEvent.click(trigger());
    expect(screen.getByText('The conditions')).toBeInTheDocument();
  });

  it('only seeds the first render by default, as on the agent page', () => {
    const { rerender } = renderFoldOut(false);

    rerender(foldOut(true));
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('follows a later turn to unhealthy when asked to', () => {
    const { rerender } = renderFoldOut(false, true);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');

    rerender(foldOut(true, true));
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('The conditions')).toBeInTheDocument();
  });

  it('never re-opens after the person closed it', async () => {
    const { rerender } = renderFoldOut(true, true);
    await userEvent.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');

    rerender(foldOut(false, true));
    rerender(foldOut(true, true));
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes again when a fresh read finds the resource healthy', () => {
    const { rerender } = renderFoldOut(true, true);

    rerender(foldOut(false, true));
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('stops following once the person opened it', async () => {
    const { rerender } = renderFoldOut(false, true);
    await userEvent.click(trigger());

    rerender(foldOut(true, true));
    rerender(foldOut(false, true));
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });
});
