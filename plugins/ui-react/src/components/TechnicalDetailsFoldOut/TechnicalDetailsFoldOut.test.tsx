import { createRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  TechnicalDetailsFoldOut,
  type TechnicalDetailsFoldOutHandle,
} from './TechnicalDetailsFoldOut';

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

  it('names one piece of technical detail by its own title', () => {
    render(
      <TechnicalDetailsFoldOut title="Input schema" defaultExpanded={false}>
        <p>The schema</p>
      </TechnicalDetailsFoldOut>,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Input schema' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Technical details' }),
    ).toBeNull();
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

  it('opens, scrolls into view and takes focus on reveal, and stays open', () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const ref = createRef<TechnicalDetailsFoldOutHandle>();
    const { rerender } = render(
      <TechnicalDetailsFoldOut
        ref={ref}
        defaultExpanded={false}
        followDefaultExpanded
      >
        <p>The conditions</p>
      </TechnicalDetailsFoldOut>,
    );

    act(() => ref.current?.reveal());

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('The conditions')).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(trigger()).toHaveFocus();

    // The person's choice: a fresh read does not fold it away again.
    rerender(
      <TechnicalDetailsFoldOut ref={ref} defaultExpanded followDefaultExpanded>
        <p>The conditions</p>
      </TechnicalDetailsFoldOut>,
    );
    rerender(
      <TechnicalDetailsFoldOut
        ref={ref}
        defaultExpanded={false}
        followDefaultExpanded
      >
        <p>The conditions</p>
      </TechnicalDetailsFoldOut>,
    );
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });
});
