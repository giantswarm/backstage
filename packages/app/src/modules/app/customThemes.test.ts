import { ConfigReader } from '@backstage/config';
import { palettes } from '@backstage/theme';
import { buildPalette, getCssVariableOverrides } from './customThemes';

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
