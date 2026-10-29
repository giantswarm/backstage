import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { TopAgentsCard } from './TopAgentsCard';

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

const LONG_NAME =
  'kagent/platform-operations-incident-responder-with-a-long-name';

// T22 C23: the name was truncated with its full text only in `title=`.
describe('TopAgentsCard at phone width', () => {
  it('gives the name its own line, wrapping, with the bar under it', async () => {
    await renderInTestApp(
      <TopAgentsCard
        title="Busiest agents"
        rows={[
          {
            id: 'a',
            label: LONG_NAME,
            href: '/agents/a',
            calls: 1200,
            sharePct: 80,
          },
          { id: 'b', label: 'Chatty', calls: 300, sharePct: 20 },
        ]}
        emptyMessage="none"
      />,
    );

    expect(screen.getByRole('link', { name: LONG_NAME })).toBeInTheDocument();
    expect(phoneRule(/row/)).toMatch(
      /grid-template-areas: "name amount" "track track"/,
    );
    const name = phoneRule(/name/);
    expect(name).toMatch(/white-space: normal/);
    expect(name).toMatch(/overflow-wrap: anywhere/);
    expect(name).toMatch(/-webkit-line-clamp: 2/);
  });
});
