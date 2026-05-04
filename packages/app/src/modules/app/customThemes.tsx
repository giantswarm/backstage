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
    ...(background && {
      background: { ...base.background, default: background },
    }),
    ...(text && {
      text: { ...(base as { text?: object }).text, primary: text },
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

export function getCssVariableOverrides(configApi: Config, variant: Variant) {
  const root = configApi.getOptionalConfig(CONFIG_KEY[variant]);
  if (!root) {
    return undefined;
  }
  const backgroundColor = root.getOptionalString('backgroundColor');
  const textColor = root.getOptionalString('textColor');
  const neutralBackground1 = root.getOptionalString('neutralBackground1');
  const neutralBackground2 = root.getOptionalString('neutralBackground2');
  const neutralBackground3 = root.getOptionalString('neutralBackground3');
  const neutralBackground4 = root.getOptionalString('neutralBackground4');
  const declarations = [
    backgroundColor && `--bui-bg-app: ${backgroundColor};`,
    textColor && `--bui-fg-primary: ${textColor};`,
    neutralBackground1 && `--bui-bg-neutral-1: ${neutralBackground1};`,
    neutralBackground2 && `--bui-bg-neutral-2: ${neutralBackground2};`,
    neutralBackground3 && `--bui-bg-neutral-3: ${neutralBackground3};`,
    neutralBackground4 && `--bui-bg-neutral-4: ${neutralBackground4};`,
  ].filter(Boolean);
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
    () => createUnifiedTheme({ palette: buildPalette(configApi, variant) }),
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
