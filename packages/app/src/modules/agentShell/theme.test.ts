// This test runs in Node and reads the stylesheet; nothing of it is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join } from 'path';
import { sidebarConfig } from '@backstage/core-components';
import {
  PHONE_MAX_WIDTH,
  TOUCH_QUERY,
} from '@giantswarm/backstage-plugin-ui-react';
import { agentShellLightColors } from './theme';

function shellCss(): string {
  return readFileSync(join(__dirname, 'agent-shell.css'), 'utf8');
}

/** The bodies of the stylesheet's `@media <query>` blocks, braces matched. */
function mediaBlocks(css: string, query: string): string[] {
  const blocks: string[] = [];
  const opener = `@media ${query} {`;
  let from = css.indexOf(opener);
  while (from !== -1) {
    const start = from + opener.length;
    let depth = 1;
    let end = start;
    while (depth > 0 && end < css.length) {
      if (css[end] === '{') depth += 1;
      if (css[end] === '}') depth -= 1;
      end += 1;
    }
    blocks.push(css.slice(start, end - 1));
    from = css.indexOf(opener, end);
  }
  return blocks;
}

const PHONE = `(max-width: ${PHONE_MAX_WIDTH}px)`;

function cssColorValues(): string[] {
  // Only values that carry a colour: the stylesheet also declares layout
  // variables (the mobile bar height), which the palette table does not own.
  return [
    ...shellCss().matchAll(/(?:--[\w-]+|color|box-shadow)\s*:\s*([^;]+);/g),
  ]
    .map(match => match[1].replace(/\s+/g, ' ').trim())
    .filter(value => value.includes('#') || value.includes('rgb'));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('agentShellLightColors', () => {
  it('marks the current rail item at 3:1 or more against its background', () => {
    expect(
      contrast(
        agentShellLightColors.railItemActiveBar,
        agentShellLightColors.railItemActive,
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  it('draws the focus ring at 3:1 or more against the background', () => {
    expect(
      contrast(
        agentShellLightColors.focusRing,
        agentShellLightColors.background,
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  // The rule for links on a tinted surface (agent-shell.css): the link colour
  // reads against the tint, but not against the body text by colour alone,
  // which is why those links are underlined.
  it('sets links at 4.5:1 against the tinted surface and the alert backgrounds', () => {
    const colors = agentShellLightColors;
    for (const surface of [
      colors.subtleSurface,
      colors.infoBackground,
      colors.successBackground,
      colors.warningBackground,
    ]) {
      expect(contrast(colors.link, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('cannot mark a link by colour alone against the body text', () => {
    expect(
      contrast(agentShellLightColors.link, agentShellLightColors.text),
    ).toBeLessThan(3);
  });

  it('lists the light palette by role', () => {
    expect(agentShellLightColors).toEqual({
      primary: '#002645',
      primaryHover: '#001b31',
      primaryPressed: '#00111f',
      onPrimary: '#ffffff',
      text: '#002645',
      textSecondary: '#5b6c79',
      link: '#00609c',
      linkHover: '#002645',
      accent: '#009fff',
      accentHover: '#0088db',
      focusRing: '#00609c',
      background: '#ffffff',
      surface: '#ffffff',
      subtleSurface: '#f0f4f6',
      border: '#e3ebef',
      borderStrong: '#d6e1e7',
      divider: '#edf2f5',
      overlayShadow: '0 12px 32px rgba(0, 38, 69, 0.14)',
      railBackground: '#f0f7f9',
      railItemHover: '#e2ecf0',
      railItemActive: '#ffffff',
      railItemActiveBorder: '#dfe7ec',
      railItemActiveBar: '#00609c',
      avatarBackground: '#002645',
      avatarText: '#ffffff',
      success: '#1f9d48',
      successBackground: '#ddf5e3',
      successText: '#14612a',
      warning: '#e86d00',
      warningBackground: '#ffe9d6',
      warningText: '#8f4000',
      warningBorder: '#f2c9a3',
      error: '#c6283a',
      running: '#009fff',
      infoBackground: '#dff1ff',
      infoText: '#004a7a',
      bodyText: '#1b3850',
      quietText: '#30475a',
      chipBorder: '#dfe7ec',
      chipBorderHover: '#b9c8d2',
      cardBorderHover: '#c4d3dc',
      composerShadow:
        '0 1px 2px rgba(0, 38, 69, 0.04), 0 8px 24px rgba(0, 38, 69, 0.06)',
      settledStatus: '#9fb2c0',
      inputBackground: '#ffffff',
      inputBorder: '#c4d3dc',
      inputBorderHover: '#b9c8d2',
      inputFocusBorder: '#0088db',
      inputFocusHalo: 'rgba(0, 159, 255, 0.15)',
    });
  });

  it('gives bui’s current warning tokens the shell’s warning colours', () => {
    // The deprecated names (`--bui-bg-warning`, …) were set and the current
    // ones were not, so a warning badge took bui's saturated default edge
    // beside the approval card's soft one.
    const css = shellCss();
    expect(css).toContain(
      `--bui-warning-bg-subdued: ${agentShellLightColors.warningBackground};`,
    );
    expect(css).toContain(
      `--bui-warning-fg-subdued: ${agentShellLightColors.warningText};`,
    );
    expect(css).toContain(
      `--bui-warning-border: ${agentShellLightColors.warningBorder};`,
    );
    expect(
      contrast(
        agentShellLightColors.warningText,
        agentShellLightColors.warningBackground,
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('edges a focused form field at 3:1 or more against its fill', () => {
    expect(
      contrast(
        agentShellLightColors.inputFocusBorder,
        agentShellLightColors.inputBackground,
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  it('draws a resting form field edge darker than the card border', () => {
    // The PO's ask: a field is findable at a glance, so its edge must read
    // stronger than the hairlines around it.
    expect(
      contrast(
        agentShellLightColors.inputBorder,
        agentShellLightColors.inputBackground,
      ),
    ).toBeGreaterThan(
      contrast(
        agentShellLightColors.borderStrong,
        agentShellLightColors.background,
      ),
    );
  });

  it('sizes the mobile bottom bar from sidebarConfig, plus the safe area', () => {
    const css = shellCss();
    // Zero by default — the desktop rail covers nothing at the bottom edge.
    expect(css).toMatch(
      /html\[data-agent-shell\] body \{\s*--agent-shell-mobile-bar-height: 0px;/,
    );
    // At phone width (MUI v4's xs bound, the bound `isMobile` answers) it is
    // the bar: sidebarConfig.mobileSidebarHeight plus the home-indicator inset.
    expect(css).toContain('@media (max-width: 599.95px)');
    expect(css).toContain(
      `--agent-shell-mobile-bar-height: calc(${sidebarConfig.mobileSidebarHeight}px + env(safe-area-inset-bottom));`,
    );
  });

  it('contains core-components tables at phone width', () => {
    expect(shellCss()).toMatch(
      /html\[data-agent-shell\] \[class\*='BackstageTable-root'\] \{\s*max-width: 100%;\s*overflow-x: auto;/,
    );
  });

  // CSS cannot import the TS constant; this keeps the two equal (T22 §2.1).
  it('switches to the phone layout at ui-react’s PHONE_MAX_WIDTH, and only there', () => {
    const widths = [
      ...shellCss().matchAll(/@media \(max-width: ([\d.]+)px\)/g),
    ].map(match => Number(match[1]));
    expect(widths.length).toBeGreaterThan(0);
    expect(new Set(widths)).toEqual(new Set([PHONE_MAX_WIDTH]));
  });

  // T22 B3 / D3: below 16px iOS Safari zooms into a field on focus.
  it('sets form controls at 16px at phone width, and only there', () => {
    const css = shellCss();
    const rule =
      /html\[data-agent-shell\] :is\(input, textarea, select\) \{\s*font-size: 16px;\s*\}/;
    expect(mediaBlocks(css, PHONE).some(block => rule.test(block))).toBe(true);
    expect(css.match(new RegExp(rule.source, 'g'))).toHaveLength(1);
  });

  // T22 §0.1 / P14: bui tables do not scroll by themselves.
  it('scrolls a bui table of four or more width-less columns inside itself at phone width', () => {
    const css = shellCss();
    expect(css).not.toContain('bring their own scroll container');
    const phone = mediaBlocks(css, PHONE).join('\n');
    expect(phone).toMatch(
      /\.bui-TableWrapper\s*> \.bui-TableScrollContainer\s*> \.bui-Table:has\(\.bui-TableHead:nth-child\(4\)\) \{\s*--agent-shell-table-columns: 4;\s*min-width: calc\(var\(--agent-shell-table-columns\) \* 7rem\);/,
    );
  });

  // T22 P13: bui's sort arrow is opacity 0 until hovered.
  it('shows bui’s table sort arrow where there is no hover', () => {
    expect(
      mediaBlocks(shellCss(), '(hover: none)').some(block =>
        /\.bui-TableHeadSortButton \{\s*opacity: 1;/.test(block),
      ),
    ).toBe(true);
  });

  // T22 B4. The upstream class is a CSS-module name with a hash suffix; the
  // shell matches its prefix, which this pins against the installed package.
  it('keeps toasts clear of the bottom bar, the docked composer and a wizard’s footer', () => {
    const upstream = readFileSync(
      join(
        require.resolve('@backstage/plugin-app/package.json'),
        '..',
        'dist/components/Toast/Toast.module.css.esm.js',
      ),
      'utf8',
    );
    expect(upstream).toMatch(
      /\.Toast_container__\w+ \{\\n\s*position: fixed;\\n\s*bottom: 1rem;/,
    );
    // `useToastHeight` measures the front toast by this prefix.
    expect(upstream).toMatch(/\.Toast_toast__\w+ \{/);

    const css = shellCss();
    expect(css).toMatch(
      /html\[data-agent-shell\] \[class\*='Toast_container'\] \{\s*bottom: calc\(\s*2rem \+ var\(--session-dock-height, 0px\) \+ var\(--wizard-footer-height, 0px\)\s*\);/,
    );
    expect(
      mediaBlocks(css, PHONE).some(block =>
        /\[class\*='Toast_container'\] \{\s*bottom: calc\(\s*var\(--agent-shell-mobile-bar-height\) \+ var\(--session-dock-height, 0px\) \+\s*var\(--wizard-footer-height, 0px\) \+ 8px\s*\);/.test(
          block,
        ),
      ),
    ).toBe(true);
  });

  // T22 C2: the bar steps aside for the soft keyboard on a touch phone.
  it('hides the bottom bar while a text field has focus on a touch phone', () => {
    const [block] = mediaBlocks(shellCss(), `${PHONE} and ${TOUCH_QUERY}`);
    expect(block).toBeDefined();
    expect(block).toMatch(
      /:not\(\[readonly\]\):focus\s*\) \{\s*--agent-shell-mobile-bar-height: 0px;/,
    );
    expect(block).toMatch(
      /:not\(\[readonly\]\):focus\s*\)\s*\.agent-shell-mobile-bar \{\s*display: none;/,
    );
    // A checkbox or a button raises no keyboard.
    expect(block).toContain("[type='checkbox']");
    expect(block).toContain("[type='button']");
  });

  it('is the only source of the colours in agent-shell.css', () => {
    const tableValues = new Set<string>(Object.values(agentShellLightColors));
    const cssValues = new Set(cssColorValues());

    expect([...cssValues].filter(value => !tableValues.has(value))).toEqual([]);
    expect(
      Object.entries(agentShellLightColors)
        .filter(([, value]) => !cssValues.has(value))
        .map(([role]) => role),
    ).toEqual(['divider']);
  });
});
