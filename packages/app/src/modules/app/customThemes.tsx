/**
 * Custom theme providers that layer optional `app.branding.theme` palette
 * overrides on top of Backstage's built-in light/dark palettes.
 *
 * Wired up in {@link AppOverrides} via `ThemeBlueprint.make({ name: 'light' })`
 * and `name: 'dark'`, which override the built-in `theme:app/light` and
 * `theme:app/dark` extensions provided by `@backstage/plugin-app`.
 */
import { ReactNode, useMemo } from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import {
  createUnifiedTheme,
  palettes,
  UnifiedThemeProvider,
} from '@backstage/theme';
import type { Config } from '@backstage/config';

type Variant = 'light' | 'dark';

/**
 * Roboto is the Giant Swarm brand typeface. Self-hosted via `@fontsource/roboto`
 * (imported in `packages/app/src/index.tsx`) rather than Google Fonts, because
 * the app's CSP has no `font-src` allowlist for external hosts.
 */
export const BRAND_FONT_FAMILY =
  "'Roboto', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const CONFIG_KEY: Record<Variant, string> = {
  light: 'app.branding.theme.light',
  dark: 'app.branding.theme.dark',
};

export function buildPalette(configApi: Config, variant: Variant) {
  const base = palettes[variant] as typeof palettes.dark;
  const root = configApi.getOptionalConfig(CONFIG_KEY[variant]);
  if (!root) {
    return base;
  }

  const primary = root.getOptionalString('primaryColor');
  const secondary = root.getOptionalString('secondaryColor');
  const background = root.getOptionalString('backgroundColor');
  const text = root.getOptionalString('textColor');
  const secondaryText = root.getOptionalString('secondaryTextColor');
  const link = root.getOptionalString('linkColor');
  const nav = root.getOptionalConfig('navigation');
  const navBackground = nav?.getOptionalString('background');
  const navIndicator = nav?.getOptionalString('indicator');
  const navColor = nav?.getOptionalString('color');
  const navSelectedColor = nav?.getOptionalString('selectedColor');

  const hasSecondary = base.secondary !== undefined || secondary !== undefined;

  return {
    ...base,
    primary: { ...base.primary, ...(primary && { main: primary }) },
    ...(hasSecondary && {
      secondary: { ...base.secondary, ...(secondary && { main: secondary }) },
    }),
    ...(link && { link, linkHover: link }),
    ...(background && {
      background: { ...base.background, default: background },
    }),
    ...((text || secondaryText) && {
      text: {
        ...(base as { text?: object }).text,
        ...(text && { primary: text }),
        ...(secondaryText && { secondary: secondaryText }),
      },
    }),
    navigation: {
      ...base.navigation,
      ...(navBackground && { background: navBackground }),
      ...(navIndicator && { indicator: navIndicator }),
      ...(navColor && { color: navColor }),
      ...(navSelectedColor && { selectedColor: navSelectedColor }),
    },
  };
}

/**
 * Maps `app.branding.theme.<variant>` config keys onto the `@backstage/ui` CSS
 * variables they override. bui reads none of the Material UI palette, so every
 * themed surface has to be declared here as well as in `buildPalette`.
 */
const BUI_VARIABLE_BY_CONFIG_KEY: Record<string, string> = {
  backgroundColor: '--bui-bg-app',
  textColor: '--bui-fg-primary',
  secondaryTextColor: '--bui-fg-secondary',
  neutralBackground1: '--bui-bg-neutral-1',
  neutralBackground2: '--bui-bg-neutral-2',
  neutralBackground3: '--bui-bg-neutral-3',
  neutralBackground4: '--bui-bg-neutral-4',
  accentColor: '--bui-accent-bg',
  accentTextColor: '--bui-accent-fg',
  // bui has no link token; the focus ring is its closest interactive accent.
  linkColor: '--bui-ring',
  border1: '--bui-border-1',
  border2: '--bui-border-2',
};

/**
 * Emits the `app.branding.theme.<variant>` overrides as a `--bui-*` block.
 * Returns `undefined` when nothing is configured, leaving bui's own defaults
 * in place.
 */
export function getCssVariableOverrides(configApi: Config, variant: Variant) {
  const root = configApi.getOptionalConfig(CONFIG_KEY[variant]);
  if (!root) {
    return undefined;
  }

  const declarations = Object.entries(BUI_VARIABLE_BY_CONFIG_KEY)
    .map(([configKey, variable]) => {
      const value = root.getOptionalString(configKey);
      return value ? `${variable}: ${value};` : undefined;
    })
    .filter(Boolean);

  return declarations.length
    ? `body[data-theme-mode='${variant}'] { ${declarations.join(' ')} }`
    : undefined;
}

function CustomThemeProvider({
  variant,
  children,
}: {
  variant: Variant;
  children: ReactNode;
}) {
  const configApi = useApi(configApiRef);
  const theme = useMemo(
    () =>
      createUnifiedTheme({
        palette: buildPalette(configApi, variant),
        fontFamily: BRAND_FONT_FAMILY,
      }),
    [configApi, variant],
  );
  const cssOverrides = getCssVariableOverrides(configApi, variant);
  return (
    <UnifiedThemeProvider theme={theme}>
      {cssOverrides && <style>{cssOverrides}</style>}
      {children}
    </UnifiedThemeProvider>
  );
}

export const LightThemeProvider = ({ children }: { children: ReactNode }) => (
  <CustomThemeProvider variant="light">{children}</CustomThemeProvider>
);

export const DarkThemeProvider = ({ children }: { children: ReactNode }) => (
  <CustomThemeProvider variant="dark">{children}</CustomThemeProvider>
);
