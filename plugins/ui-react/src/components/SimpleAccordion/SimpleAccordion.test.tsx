import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SimpleAccordion } from './SimpleAccordion';

/** The trigger button — the element bui puts `aria-expanded` on. */
const trigger = (name: string) => screen.getByRole('button', { name });

describe('SimpleAccordion', () => {
  it('starts collapsed and reveals its content when triggered', async () => {
    render(
      <SimpleAccordion title="How to set up tsh">
        <p>Install the client.</p>
      </SimpleAccordion>,
    );

    expect(trigger('How to set up tsh')).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await userEvent.click(trigger('How to set up tsh'));

    expect(trigger('How to set up tsh')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Install the client.')).toBeInTheDocument();
  });

  it('honours defaultExpanded', () => {
    render(
      <SimpleAccordion title="Raw data" defaultExpanded>
        <p>Payload.</p>
      </SimpleAccordion>,
    );

    expect(trigger('Raw data')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Payload.')).toBeInTheDocument();
  });

  it('accepts a node as the title, for a header carrying more than a label', () => {
    render(
      <SimpleAccordion
        title={
          <span>
            Ready <em>9 days ago</em>
          </span>
        }
      >
        <p>Detail.</p>
      </SimpleAccordion>,
    );

    expect(screen.getByText('9 days ago')).toBeInTheDocument();
  });

  // The reason this component exists. The rule has to target the trigger *button*
  // — `aria-expanded` lives there, not on the `<h3>` wrapping it — and a selector
  // scoped to the wrong element fails silently, which is exactly what a rendering
  // test cannot see. Assert the class is scoped to something that actually
  // matches the button in the rendered markup.
  it('scopes the trigger-spacing rule to the element that carries aria-expanded', () => {
    const { container } = render(
      <SimpleAccordion title="Conditions" defaultExpanded>
        <p>Detail.</p>
      </SimpleAccordion>,
    );

    const button = trigger('Conditions');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveClass('bui-AccordionTriggerButton');

    // The generated class sits on an ancestor of the button, so a descendant
    // selector from it can reach the button. Were it applied to the trigger
    // element itself with `&[aria-expanded]`, nothing would ever match.
    const styled = container.querySelector('[class*="makeStyles-group"]');
    expect(styled).not.toBeNull();
    expect(styled).toContainElement(button);
    expect(styled).not.toBe(button);
  });
});
