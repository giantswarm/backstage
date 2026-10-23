// This test reads the stylesheet from disk; nothing of it is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Card, CardBody, Link } from '@backstage/ui';

const shellCss = readFileSync(join(__dirname, 'agent-shell.css'), 'utf8');

// The Configuration card's "See tools" could not be told from the text: the
// rule for links on a tinted surface keys on the attribute bui gives that
// surface.
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

  it('underlines every text link there in the shell’s link colour', () => {
    // jsdom cannot match `:is()` with `:not()` lists, so the rule is read,
    // not computed.
    expect(shellCss).toMatch(
      /html\[data-agent-shell\]\s+:is\(\.bui-Alert, \[data-bg='neutral-2'\]\)\s+a:not\([^)]*\)\s*:not\(\[data-bg='neutral-3'\] a\) \{\s*color: var\(--agent-shell-link\);\s*text-decoration-line: underline;\s*text-decoration-color: currentColor;/,
    );
  });
});
