import { ConfigReader } from '@backstage/config';
import { configApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import { BackstageTheme, createUnifiedTheme, palettes } from '@backstage/theme';
import { render } from '@testing-library/react';
import { AGENT_SHELL_FONT_FAMILY } from '../agentShell/theme';
import {
  buildPalette,
  buildThemeOptions,
  DarkThemeProvider,
  getCssVariableOverrides,
} from './customThemes';

describe('buildPalette', () => {
  it('returns the built-in palette unchanged when no overrides are configured', () => {
    const config = new ConfigReader({});
    expect(buildPalette(config, 'light')).toEqual(palettes.light);
    expect(buildPalette(config, 'dark')).toEqual(palettes.dark);
  });

  it('overrides primary, secondary, background, text, and navigation colors when set', () => {
    const config = new ConfigReader({
      app: {
        branding: {
          theme: {
            light: {
              primaryColor: '#111111',
              secondaryColor: '#222222',
              backgroundColor: '#777777',
              textColor: '#888888',
              navigation: {
                background: '#333333',
                indicator: '#444444',
                color: '#555555',
                selectedColor: '#666666',
              },
            },
          },
        },
      },
    });

    const palette = buildPalette(config, 'light') as ReturnType<
      typeof buildPalette
    > & { text: { primary: string } };

    expect(palette.primary.main).toBe('#111111');
    expect(palette.secondary.main).toBe('#222222');
    expect(palette.background.default).toBe('#777777');
    // background.paper is preserved from the built-in palette.
    expect(palette.background.paper).toBe(palettes.light.background.paper);
    expect(palette.text.primary).toBe('#888888');
    expect(palette.navigation.background).toBe('#333333');
    expect(palette.navigation.indicator).toBe('#444444');
    expect(palette.navigation.color).toBe('#555555');
    expect(palette.navigation.selectedColor).toBe('#666666');
    // Untouched fields keep their built-in values.
    expect(palette.navigation.navItem).toEqual(
      palettes.light.navigation.navItem,
    );
  });

  it('leaves background and text untouched when their keys are not set', () => {
    const config = new ConfigReader({
      app: {
        branding: {
          theme: {
            dark: { primaryColor: '#abcdef' },
          },
        },
      },
    });

    const palette = buildPalette(config, 'dark') as ReturnType<
      typeof buildPalette
    > & { text?: unknown };

    expect(palette.background).toEqual(palettes.dark.background);
    expect(palette.text).toBeUndefined();
  });

  it('only overrides the keys that are set, leaving others as built-in defaults', () => {
    const config = new ConfigReader({
      app: {
        branding: {
          theme: {
            dark: {
              primaryColor: '#abcdef',
              navigation: {
                indicator: '#fedcba',
              },
            },
          },
        },
      },
    });

    const palette = buildPalette(config, 'dark');

    expect(palette.primary.main).toBe('#abcdef');
    expect(palette.secondary.main).toBe(palettes.dark.secondary.main);
    expect(palette.navigation.indicator).toBe('#fedcba');
    expect(palette.navigation.background).toBe(
      palettes.dark.navigation.background,
    );
    expect(palette.navigation.color).toBe(palettes.dark.navigation.color);
    expect(palette.navigation.selectedColor).toBe(
      palettes.dark.navigation.selectedColor,
    );
  });

  it('emits CSS variable overrides for backgroundColor, textColor, and neutralBackgrounds', () => {
    const config = new ConfigReader({
      app: {
        branding: {
          theme: {
            dark: {
              backgroundColor: '#101010',
              textColor: '#eeeeee',
              neutralBackground1: '#202020',
              neutralBackground2: '#303030',
              neutralBackground3: '#404040',
              neutralBackground4: '#505050',
            },
            light: {},
          },
        },
      },
    });

    const css = getCssVariableOverrides(config, 'dark');
    expect(css).toContain("body[data-theme-mode='dark']");
    expect(css).toContain('--bui-bg-app: #101010;');
    expect(css).toContain('--bui-fg-primary: #eeeeee;');
    expect(css).toContain('--bui-bg-neutral-1: #202020;');
    expect(css).toContain('--bui-bg-neutral-2: #303030;');
    expect(css).toContain('--bui-bg-neutral-3: #404040;');
    expect(css).toContain('--bui-bg-neutral-4: #505050;');

    // No declarations for an empty variant.
    expect(getCssVariableOverrides(config, 'light')).toBeUndefined();

    // No config at all yields undefined.
    expect(
      getCssVariableOverrides(new ConfigReader({}), 'dark'),
    ).toBeUndefined();
  });

  it('isolates light and dark variants', () => {
    const config = new ConfigReader({
      app: {
        branding: {
          theme: {
            light: { primaryColor: '#aaaaaa' },
          },
        },
      },
    });

    expect(buildPalette(config, 'light').primary.main).toBe('#aaaaaa');
    expect(buildPalette(config, 'dark').primary.main).toBe(
      palettes.dark.primary.main,
    );
  });
});

describe('buildThemeOptions', () => {
  const branded = new ConfigReader({
    app: {
      branding: {
        theme: {
          light: { primaryColor: '#111111', textColor: '#888888' },
        },
      },
    },
  });

  it.each([
    ['without branding', new ConfigReader({})],
    ['with branding', branded],
  ])(
    'leaves the theme unchanged with the agent shell flag off (%s)',
    (_, config) => {
      for (const variant of ['light', 'dark'] as const) {
        expect(buildThemeOptions(config, variant, false)).toEqual({
          palette: buildPalette(config, variant),
        });
      }
    },
  );

  it('keeps the built-in light theme values with the agent shell flag off', () => {
    const light = createUnifiedTheme(
      buildThemeOptions(new ConfigReader({}), 'light', false),
    ).getTheme('v4') as BackstageTheme;
    expect({
      primary: light.palette.primary.main,
      textPrimary: light.palette.text.primary,
      backgroundDefault: light.palette.background.default,
      link: light.palette.link,
      linkHover: light.palette.linkHover,
      fontFamily: light.typography.fontFamily,
    }).toEqual({
      primary: palettes.light.primary.main,
      textPrimary: 'rgba(0, 0, 0, 0.87)',
      backgroundDefault: palettes.light.background.default,
      link: palettes.light.link,
      linkHover: palettes.light.linkHover,
      fontFamily: '"Helvetica Neue", Helvetica, Roboto, Arial, sans-serif',
    });
  });

  it('applies the agent shell colours on top of the light branding', () => {
    const off = buildThemeOptions(branded, 'light', false);
    const on = buildThemeOptions(branded, 'light', true);

    expect(on.fontFamily).toBe(AGENT_SHELL_FONT_FAMILY);
    expect(on.palette).toMatchObject({
      primary: { main: '#002645' },
      text: { primary: '#002645', secondary: '#5b6c79' },
      background: { default: '#ffffff', paper: '#ffffff' },
      divider: '#edf2f5',
      border: '#e3ebef',
      textSubtle: '#5b6c79',
      link: '#00609c',
      linkHover: '#002645',
      status: {
        ok: '#1f9d48',
        warning: '#e86d00',
        error: '#c6283a',
        running: '#009fff',
      },
      warningBackground: '#ffe9d6',
      warningText: '#8f4000',
      infoBackground: '#dff1ff',
      infoText: '#004a7a',
    });

    const strip = (palette: Record<string, any>) => {
      const {
        link,
        linkHover,
        divider,
        border,
        textSubtle,
        warningBackground,
        warningText,
        infoBackground,
        infoText,
        ...rest
      } = palette;
      return {
        ...rest,
        primary: { ...rest.primary, main: undefined },
        text: { ...rest.text, primary: undefined, secondary: undefined },
        background: {
          ...rest.background,
          default: undefined,
          paper: undefined,
        },
        status: {
          ...rest.status,
          ok: undefined,
          warning: undefined,
          error: undefined,
          running: undefined,
        },
      };
    };
    expect(strip(on.palette)).toEqual(strip(off.palette));
  });

  it('builds the light agent-shell theme for the dark variant too (light-only shell)', () => {
    const config = new ConfigReader({});
    const dark = buildThemeOptions(config, 'dark', true);

    // Identical to the light variant's agent-shell theme...
    expect(dark).toEqual(buildThemeOptions(config, 'light', true));
    // ...and marked as a light theme, which is what UnifiedThemeProvider
    // writes into body[data-theme-mode] for bui and agent-shell.css.
    expect(dark.palette).toMatchObject({ type: 'light', mode: 'light' });
    const v4 = createUnifiedTheme(dark).getTheme('v4') as BackstageTheme;
    expect(v4.palette.type).toBe('light');
    expect(v4.palette.background.default).toBe('#ffffff');
  });

  it('builds the light agent-shell theme for the dark variant on top of light branding', () => {
    expect(buildThemeOptions(branded, 'dark', true)).toEqual(
      buildThemeOptions(branded, 'light', true),
    );
  });
});

describe('theme providers under the agent shell', () => {
  afterEach(() => {
    delete document.documentElement.dataset.agentShell;
  });

  // The dark provider is what renders for a user whose theme preference is
  // dark (or auto resolving dark); rendered directly so no test-app theme
  // wrapper pushes its own body[data-theme-mode] on top.
  function renderDarkProvider() {
    return render(
      <TestApiProvider apis={[[configApiRef, new ConfigReader({})]]}>
        <DarkThemeProvider>
          <div data-testid="content" />
        </DarkThemeProvider>
      </TestApiProvider>,
    );
  }

  it('renders light while data-agent-shell is set, despite a dark preference', () => {
    document.documentElement.dataset.agentShell = '';
    renderDarkProvider();
    expect(document.body).toHaveAttribute('data-theme-mode', 'light');
  });

  it('keeps the dark theme on classic routes (no data-agent-shell)', () => {
    renderDarkProvider();
    expect(document.body).toHaveAttribute('data-theme-mode', 'dark');
  });
});
