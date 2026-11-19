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
import { agentShellDarkColors, agentShellLightColors } from './theme';

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

/** The blocks of the stylesheet that style the dark theme mode. */
const DARK_BLOCK = /[^{}]*\[data-theme-mode='dark'\][^{}]*\{[^{}]*\}/g;

function cssColorValues(css: string): string[] {
  // Only values that carry a colour: the stylesheet also declares layout
  // variables (the mobile bar height), which the palette table does not own.
  return [...css.matchAll(/(?:--[\w-]+|color|box-shadow)\s*:\s*([^;]+);/g)]
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
  it('keeps secondary text at 4.5:1 or more on a surface and on a highlighted row', () => {
    // The search palette's descriptions and key hints (issue #39049): the
    // dialog's surface, and the row the arrow keys or the pointer are on.
    expect(
      contrast(
        agentShellLightColors.textSecondary,
        agentShellLightColors.surface,
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(
        agentShellLightColors.textSecondary,
        agentShellLightColors.railItemHover,
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

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

  // Production builds name makeStyles classes jss<n>, so these match only in development.
  it('targets no makeStyles class name', () => {
    expect(shellCss()).not.toMatch(/\[class[*^|~$]?=\s*['"]?Backstage/);
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

  // Each mode's blocks against its own table, so a dark value in a light
  // block, or the reverse, fails.
  it('is the only source of the colours in agent-shell.css', () => {
    const css = shellCss();
    const darkCss = (css.match(DARK_BLOCK) ?? []).join('\n');
    expect(darkCss).not.toBe('');

    const lightTable = new Set<string>(Object.values(agentShellLightColors));
    const lightValues = new Set(cssColorValues(css.replace(DARK_BLOCK, '')));
    expect([...lightValues].filter(value => !lightTable.has(value))).toEqual(
      [],
    );
    expect(
      Object.entries(agentShellLightColors)
        .filter(([, value]) => !lightValues.has(value))
        .map(([role]) => role),
    ).toEqual(['divider']);

    const darkTable = new Set<string>(Object.values(agentShellDarkColors));
    const darkValues = new Set(cssColorValues(darkCss));
    expect([...darkValues].filter(value => !darkTable.has(value))).toEqual([]);
    expect(
      Object.entries(agentShellDarkColors)
        .filter(([, value]) => !darkValues.has(value))
        .map(([role]) => role),
    ).toEqual([]);
  });
});

/**
 * bui's own surfaces where the shell does not repaint them: the dark theme,
 * which the shell reaches only inside a toast (it inverts the theme the
 * person picked), and the light app background a toast takes when it is the
 * light one. Read from the installed bui stylesheet, so a bui upgrade that
 * darkens or lightens a surface fails here rather than on the page.
 */
function buiTokens(mode: 'light' | 'dark'): Record<string, string> {
  const css = readFileSync(
    join(
      require.resolve('@backstage/ui/package.json'),
      '..',
      'dist/css/styles.css',
    ),
    'utf8',
  );
  const start = css.indexOf(
    mode === 'light' ? '/* Light theme tokens' : '/* Dark theme tokens',
  );
  if (start === -1) {
    throw new Error(`bui's ${mode} tokens moved in its stylesheet`);
  }
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/(--bui-[\w-]+):\s*(#[0-9a-f]{6});/gi)].map(m => [
      m[1],
      m[2].toLowerCase(),
    ]),
  );
}

// The one rule for text links (agent-shell.css). Colour and underline both
// mark a link: the colour against the surface it sits on (4.5:1, as text),
// the underline against the body text around it, where the colour alone falls
// short of 3:1.
describe('agent-shell.css text links', () => {
  /** The text-link rule's body, nested rules included, braces matched. */
  const linkRule = (css: string): string | undefined => {
    const opener = css.match(
      /html\[data-agent-shell\]\s*:is\(\.bui-Link, \.MuiLink-root, \[class\*='Toast_links'\] a\):not\([^)]*\) \{/,
    );
    if (!opener || opener.index === undefined) {
      return undefined;
    }
    const start = opener.index + opener[0].length;
    let depth = 1;
    let end = start;
    while (depth > 0 && end < css.length) {
      if (css[end] === '{') depth += 1;
      if (css[end] === '}') depth -= 1;
      end += 1;
    }
    return css.slice(start, end - 1);
  };

  it('defines the link colours by theme mode, from the palette tables', () => {
    const css = shellCss();
    expect(css).toMatch(
      new RegExp(
        `html\\[data-agent-shell\\] \\[data-theme-mode='light'\\] \\{\\s*--agent-shell-link: ${agentShellLightColors.link};\\s*--agent-shell-link-hover: ${agentShellLightColors.linkHover};`,
      ),
    );
    expect(css).toMatch(
      new RegExp(
        `html\\[data-agent-shell\\] \\[data-theme-mode='dark'\\] \\{\\s*--agent-shell-link: ${agentShellDarkColors.link};\\s*--agent-shell-link-hover: ${agentShellDarkColors.linkHover};`,
      ),
    );
  });

  it('colours and solidly underlines every text link with one rule', () => {
    const rule = linkRule(shellCss());
    expect(rule).toBeDefined();
    expect(rule).toContain('color: var(--agent-shell-link);');
    expect(rule).toContain('text-decoration-line: underline;');
    expect(rule).toContain('text-decoration-style: solid;');
    expect(rule).toContain('text-decoration-color: currentColor;');
    // One exclusion list for rest and hover: the hover is nested.
    expect(rule).toMatch(
      /&:hover \{\s*color: var\(--agent-shell-link-hover\);\s*text-decoration-thickness: 2px;\s*\}/,
    );
    expect(shellCss().match(/:is\(\.bui-Link, \.MuiLink-root/g)).toHaveLength(
      1,
    );
  });

  it('gives a bui Text inside a text link the link’s colour', () => {
    // bui's Text sets its own colour, which would sit under the link's
    // underline. jsdom applies no nested rules, so this reads the rule.
    expect(linkRule(shellCss())).toMatch(
      /& \.bui-Text \{\s*color: inherit;\s*\}/,
    );
  });

  it('opts a bui link out only when it is standalone', () => {
    // bui writes `standalone={false}` as data-standalone="false".
    expect(shellCss()).toContain("[data-standalone='true']");
    expect(shellCss()).not.toMatch(/\[data-standalone\](?!=)/);
  });

  it('keeps no per-surface link rule', () => {
    // #3254's rule keyed on bui's surface attribute and the banner, with a
    // growing list of exclusions; the one rule above replaced it.
    const css = shellCss();
    expect(css).not.toMatch(/\[data-bg='neutral-\d'\][^{]*\ba\b/);
    expect(css).not.toMatch(/\.bui-Alert\s+a\b/);
    expect(css.match(/var\(--agent-shell-link\)/g)).toHaveLength(2);
  });

  describe('light', () => {
    const colors = agentShellLightColors;
    const bui = buiTokens('light');

    it.each([
      ['white surface', colors.surface],
      ['tinted surface (neutral-2)', colors.subtleSurface],
      ['rail', colors.railBackground],
      ['info banner', colors.infoBackground],
      ['success banner', colors.successBackground],
      ['warning banner', colors.warningBackground],
      // bui's Alert still paints its banners with the deprecated tokens.
      // eslint-disable-next-line @backstage/no-deprecated-bui-tokens
      ['danger banner (bui)', bui['--bui-bg-danger']],
      ['light toast (bui app)', bui['--bui-bg-app']],
    ])('holds 4.5:1 against the %s', (_, surface) => {
      expect(surface).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(colors.link, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.linkHover, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it('is told from the body text by its underline, as colour alone falls short of 3:1', () => {
      for (const text of [colors.text, colors.bodyText, colors.quietText]) {
        expect(contrast(colors.link, text)).toBeLessThan(3);
      }
      expect(linkRule(shellCss())).toContain(
        'text-decoration-line: underline;',
      );
    });
  });

  describe('dark', () => {
    const colors = agentShellDarkColors;
    const bui = buiTokens('dark');

    // bui nests surfaces up to neutral-3 (useBg), so neutral-4 never holds a
    // link. bui's Alert still paints its banners with the deprecated tokens.
    /* eslint-disable @backstage/no-deprecated-bui-tokens */
    it.each([
      ['app background (a toast)', '--bui-bg-app'],
      ['neutral-1 surface', '--bui-bg-neutral-1'],
      ['neutral-2 surface', '--bui-bg-neutral-2'],
      ['neutral-3 surface', '--bui-bg-neutral-3'],
      ['info banner', '--bui-bg-info'],
      ['success banner', '--bui-bg-success'],
      ['warning banner', '--bui-bg-warning'],
      ['danger banner', '--bui-bg-danger'],
      /* eslint-enable @backstage/no-deprecated-bui-tokens */
    ])('holds 4.5:1 against the %s', (_, token) => {
      const surface = bui[token];
      expect(surface).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(colors.link, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.linkHover, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it('is told from the body text by its underline, as colour alone falls short of 3:1', () => {
      expect(contrast(colors.link, '#ffffff')).toBeLessThan(3);
      expect(linkRule(shellCss())).toContain(
        'text-decoration-line: underline;',
      );
    });
  });
});
