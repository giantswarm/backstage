import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoreOptions } from './MoreOptions';

function Harness({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <MoreOptions
        open={open}
        onOpenChange={setOpen}
        summary="technical name sonnet-4-5"
      >
        <label>
          Technical name
          <input defaultValue="sonnet-4-5" />
        </label>
      </MoreOptions>
      <button onClick={() => setOpen(true)}>Open from outside</button>
    </>
  );
}

const disclosure = () =>
  screen.getByText('More options').closest('details') as HTMLDetailsElement;

describe('MoreOptions', () => {
  it('starts folded, says what is folded away, and keeps the fields mounted', () => {
    render(<Harness />);

    expect(disclosure()).not.toHaveAttribute('open');
    expect(disclosure().querySelector('summary')).toHaveTextContent(
      'More options · technical name sonnet-4-5',
    );
    expect(screen.getByLabelText('Technical name')).toBeInTheDocument();
  });

  it('opens on its summary and on request from the page', async () => {
    const { unmount } = render(<Harness />);
    await userEvent.click(screen.getByText('More options'));
    expect(disclosure()).toHaveAttribute('open');
    unmount();

    render(<Harness />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Open from outside' }),
    );
    expect(disclosure()).toHaveAttribute('open');
  });
});
