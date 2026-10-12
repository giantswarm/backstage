import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Stat, StatDelta, StatGrid } from './Stat';

const injectedCss = () =>
  Array.from(document.querySelectorAll('style'))
    .map(style => style.textContent ?? '')
    .join('\n');

/** The declarations under the phone query for the first class matching `name`. */
function phoneRule(name: RegExp): string | undefined {
  return new RegExp(
    `@media \\(max-width: 599\\.95px\\) \\{\\s*\\.[\\w-]*${name.source}[\\w-]* \\{([^}]*)\\}`,
  ).exec(injectedCss())?.[1];
}

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

describe('Stat as a tile', () => {
  it('puts a delta on the value baseline and a sub line under it', () => {
    render(
      <Stat
        variant="tile"
        label="Spend"
        value="$1,234.56"
        beside={<StatDelta>+12% vs last week</StatDelta>}
        sub="7 days"
      />,
    );

    const value = screen.getByText('$1,234.56');
    expect(value.parentElement).toContainElement(
      screen.getByText('+12% vs last week'),
    );
    expect(screen.getByText('7 days')).toBeInTheDocument();
  });

  // jsdom applies no media queries; the injected rule is what can be pinned.
  // The grid's geometry at 375px is a real-browser check.
  it('lays tiles out two across at phone width, not one per row', () => {
    render(
      <StatGrid>
        <Stat variant="tile" label="Spend" value="$1,234.56" />
        <Stat variant="tile" label="Model calls" value="12,345" />
        <Stat variant="tile" label="Tokens" value="7.5M" />
      </StatGrid>,
    );

    expect(screen.getByText('$1,234.56')).toBeInTheDocument();
    expect(phoneRule(/grid/)).toMatch(
      /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    );
    // The value steps down so a money figure stays on one line in half the width.
    expect(phoneRule(/tileValue/)).toMatch(/font-size: 1\.375rem/);
  });
});
