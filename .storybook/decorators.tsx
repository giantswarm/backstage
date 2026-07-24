import { ReactNode, useMemo } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ConfigReader } from '@backstage/config';
import { configApiRef, errorApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import { createUnifiedTheme, UnifiedThemeProvider } from '@backstage/theme';
import type { Decorator } from '@storybook/react';
// Reuse the *real* app palette-building logic so stories render in the exact
// theme users see. `buildPalette` is a pure function; with an empty config it
// returns the built-in GS light/dark palettes (no branding overrides), matching
// a default deployment.
import { buildPalette } from '../packages/app/src/modules/app/customThemes';

const emptyConfig = new ConfigReader({});

// Built once: the two production themes. `UnifiedThemeProvider` applies the MUI
// v4 + v5 theme and also sets `data-theme-mode` on <body>, which is what bui
// (@backstage/ui) reads to switch its own light/dark tokens — so a single
// provider themes all three UI layers at once.
const themes = {
  light: createUnifiedTheme({ palette: buildPalette(emptyConfig, 'light') }),
  dark: createUnifiedTheme({ palette: buildPalette(emptyConfig, 'dark') }),
};

// A no-op ErrorApi so components that report copy/errors (e.g. CodeBlock) can
// resolve `errorApiRef` without a real app.
const errorApi = {
  post: () => {},
  error$: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) as any,
};

function Providers({
  children,
  themeName,
  initialEntries,
}: {
  children: ReactNode;
  themeName: 'light' | 'dark';
  initialEntries: string[];
}) {
  const theme = useMemo(() => themes[themeName] ?? themes.light, [themeName]);
  return (
    <TestApiProvider
      apis={[
        [errorApiRef, errorApi],
        [configApiRef, emptyConfig],
      ]}
    >
      <UnifiedThemeProvider theme={theme}>
        <MemoryRouter initialEntries={initialEntries}>
          <div style={{ padding: 24 }}>{children}</div>
        </MemoryRouter>
      </UnifiedThemeProvider>
    </TestApiProvider>
  );
}

/**
 * Global decorator: wraps every story in the GS theme (switchable from the
 * toolbar) plus the API and router context the shared components expect.
 *
 * A story can seed the router (e.g. to open a URL-driven `DetailsPane`) with:
 *   parameters: { router: { initialEntries: ['/?pane=my-pane&...'] } }
 */
export const withGSProviders: Decorator = (Story, context) => {
  const themeName = (context.globals.theme as 'light' | 'dark') ?? 'light';
  const initialEntries = context.parameters?.router?.initialEntries ?? ['/'];
  return (
    <Providers themeName={themeName} initialEntries={initialEntries}>
      <Story />
    </Providers>
  );
};
