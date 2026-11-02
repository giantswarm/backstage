import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectableCard, SelectableCardGrid } from './SelectableCard';

/** Every CSS rule JSS injected, as one string. */
const injectedCss = () =>
  Array.from(document.querySelectorAll('style'))
    .map(style => style.textContent ?? '')
    .join('\n');

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('SelectableCard', () => {
  function renderCard(onSelect = jest.fn()) {
    render(
      <SelectableCardGrid role="group" ariaLabel="Skills">
        <SelectableCard
          role="checkbox"
          selected={false}
          ariaLabel="kubernetes_troubleshooting_and_incident_response"
          onSelect={onSelect}
          hoverAction={<button type="button">Show more</button>}
        >
          <span>kubernetes_troubleshooting_and_incident_response</span>
        </SelectableCard>
      </SelectableCardGrid>,
    );
    return onSelect;
  }

  it('selects on a press, and its own control does not', async () => {
    const user = userEvent.setup();
    const onSelect = renderCard();

    // On a desktop the control is untouchable until revealed: focus is one
    // way (hover the other, which jsdom does not render).
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Show more' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('checkbox', {
        name: 'kubernetes_troubleshooting_and_incident_response',
      }),
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('shows its control where nothing hovers, in the card’s flow', () => {
    renderCard();
    const action = screen.getByRole('button', {
      name: 'Show more',
    }).parentElement!;
    const actionClass = [...action.classList].find(name =>
      name.includes('hoverAction'),
    )!;

    // jsdom applies no media queries; the rule is what can be pinned here.
    const rule = new RegExp(
      `@media \\(hover: none\\), \\(max-width: 599\\.95px\\) \\{\\s*\\.${escape(
        actionClass,
      )} \\{([^}]*)\\}`,
    ).exec(injectedCss());
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/opacity: 1;/);
    expect(rule![1]).toMatch(/pointer-events: auto;/);
    expect(rule![1]).toMatch(/position: static;/);
  });

  it('lets a long unbroken name wrap inside the card', () => {
    renderCard();
    const name = screen.getByText(
      'kubernetes_troubleshooting_and_incident_response',
    );
    const contentClass = [...name.parentElement!.classList].find(c =>
      c.includes('content'),
    )!;

    const rule = new RegExp(`\\.${escape(contentClass)} \\{([^}]*)\\}`).exec(
      injectedCss(),
    );
    expect(rule![1]).toMatch(/min-width: 0;/);
    expect(rule![1]).toMatch(/overflow-wrap: anywhere;/);
  });
});
