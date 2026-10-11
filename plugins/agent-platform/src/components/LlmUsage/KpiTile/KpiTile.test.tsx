import { render, screen } from '@testing-library/react';
import { KpiTile, KpiTileGrid } from './KpiTile';

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

// jsdom applies no media queries; the injected rule is what can be pinned
// (T22 P8). The grid's geometry at 375px is a real-browser check.
describe('KpiTileGrid at phone width', () => {
  it('lays the tiles out two across, not one per row', () => {
    render(
      <KpiTileGrid>
        <KpiTile label="Spend" value="$1,234.56" />
        <KpiTile label="Model calls" value="12,345" />
        <KpiTile label="Tokens" value="7.5M" />
      </KpiTileGrid>,
    );

    expect(screen.getByText('$1,234.56')).toBeInTheDocument();
    expect(phoneRule(/grid/)).toMatch(
      /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    );
    // The value steps down so a money figure stays on one line in half the width.
    expect(phoneRule(/value/)).toMatch(/font-size: 1\.375rem/);
  });
});
