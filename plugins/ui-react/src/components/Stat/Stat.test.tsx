import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Stat } from './Stat';

describe('Stat', () => {
  it('renders the label and the value', () => {
    render(<Stat label="Input tokens" value="8.4M" />);

    expect(screen.getByText('Input tokens')).toBeInTheDocument();
    expect(screen.getByText('8.4M')).toBeInTheDocument();
  });

  it('leaves the value uncoloured without a tone', () => {
    render(<Stat label="Turns" value="62" />);

    expect(screen.getByText('62').getAttribute('style')).toBeNull();
  });

  it('colours the value when given a tone', () => {
    render(<Stat label="Error ratio" value="12%" tone="warning" />);

    expect(screen.getByText('12%').getAttribute('style')).toMatch(/color:/);
  });

  it('accepts a node as the value, not only a string', () => {
    render(<Stat label="Latency" value={<em>n/a</em>} />);

    expect(screen.getByText('n/a').tagName).toBe('EM');
  });

  it('has no hint affordance unless one is given', () => {
    render(<Stat label="Turns" value="62" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('names the stat in the hint button, and shows the hint on focus', async () => {
    // Focus, not hover: the affordance exists because a tooltip on inert text
    // is unreachable by keyboard, so that is the path worth asserting.
    const user = userEvent.setup();
    render(
      <Stat
        label="Tokens per second"
        value="63/s"
        hint="The median streamed call's generation speed."
      />,
    );

    const button = screen.getByRole('button', {
      name: 'How Tokens per second is calculated',
    });
    await user.tab();
    expect(button).toHaveFocus();
    expect(
      await screen.findByText("The median streamed call's generation speed."),
    ).toBeInTheDocument();
  });
});
