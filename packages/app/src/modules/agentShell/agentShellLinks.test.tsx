import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Card, CardBody, Link } from '@backstage/ui';

// The Configuration card's "See tools" could not be told from the text: the
// rule for links on a tinted surface (agent-shell.css) keys on the attribute
// bui gives that surface. jsdom cannot apply the rule itself; the agentlab
// suite checks the computed underline and colour.
describe('agent-shell.css links on a tinted surface', () => {
  it('finds a card inside a card on bui’s neutral-2 surface, and one more inside on neutral-3', () => {
    render(
      <MemoryRouter>
        <Card>
          <CardBody>
            <Card>
              <CardBody>
                <Link href="/tools">See tools</Link>
                <Card>
                  <CardBody>
                    <Link href="/nested">Nested</Link>
                  </CardBody>
                </Card>
              </CardBody>
            </Card>
          </CardBody>
        </Card>
      </MemoryRouter>,
    );

    // A renamed attribute or level in a bui upgrade would silently drop the
    // underline again.
    const link = screen.getByRole('link', { name: 'See tools' });
    expect(link).toHaveClass('bui-Link');
    expect(link.closest('[data-bg]')).toHaveAttribute('data-bg', 'neutral-2');
    expect(
      screen.getByRole('link', { name: 'Nested' }).closest('[data-bg]'),
    ).toHaveAttribute('data-bg', 'neutral-3');
  });
});
