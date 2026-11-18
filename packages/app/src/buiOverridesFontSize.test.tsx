// This test reads the stylesheets from disk; nothing of them is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { Badge, Tag, TagGroup, Text } from '@backstage/ui';
import {
  applyBuiStylesheets,
  resolvedFontSize,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';

const overridesCss = readFileSync(join(__dirname, 'bui-overrides.css'), 'utf8');

function renderBuiTenPxPieces() {
  render(
    <>
      <Text variant="body-x-small">Harness</Text>
      <Badge size="small">Default</Badge>
      <TagGroup aria-label="Labels">
        <Tag size="small">team</Tag>
      </TagGroup>
      <Text variant="body-small">Caption</Text>
    </>,
  );
  applyBuiStylesheets(overridesCss);
}

/** The sizes of the pieces `renderBuiTenPxPieces` renders, in px. */
function piecesFontSizes() {
  return [
    screen.getByText('Harness'),
    screen.getByText('Default'),
    screen.getByRole('row', { name: 'team' }),
    screen.getByText('Caption'),
  ].map(resolvedFontSize);
}

describe('bui-overrides.css text size', () => {
  afterEach(() => document.body.removeAttribute('data-theme-mode'));

  it("sets bui's 10px pieces at 12px under a theme", () => {
    // bui declares its tokens again where a theme applies, the body in the app.
    document.body.setAttribute('data-theme-mode', 'light');
    renderBuiTenPxPieces();

    expect(piecesFontSizes()).toEqual([12, 12, 12, 12]);
  });

  it("sets them at 12px before or outside a theme provider, from bui's root tokens", () => {
    renderBuiTenPxPieces();

    expect(piecesFontSizes()).toEqual([12, 12, 12, 12]);
  });

  it('is loaded by Storybook after bui, as in the app', () => {
    const preview = readFileSync(
      join(__dirname, '../../../.storybook/preview.tsx'),
      'utf8',
    );
    const bui = preview.indexOf("import '@backstage/ui/css/styles.css';");
    const overrides = preview.indexOf(
      "import '../packages/app/src/bui-overrides.css';",
    );

    expect(bui).toBeGreaterThanOrEqual(0);
    expect(overrides).toBeGreaterThan(bui);
  });
});
