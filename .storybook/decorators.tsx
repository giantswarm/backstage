import { ComponentType, ReactNode, useMemo } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ConfigReader } from '@backstage/config';
import { configApiRef, errorApiRef } from '@backstage/core-plugin-api';
import {
  createTestAppWrapper,
  MockErrorApi,
  TestApiProvider,
} from '@backstage/test-utils';
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

// A real (test) ErrorApi so components that report errors (e.g. CodeBlock's
// copy-failure path) can resolve `errorApiRef` without a full app.
const errorApi = new MockErrorApi();

type TestAppOptions = Parameters<typeof createTestAppWrapper>[0];
type Wrapper = ComponentType<{ children?: ReactNode }>;

// `createTestAppWrapper` returns a new component *type* per call, and React
// remounts a subtree whose type changed — so building one per render would tear
// the app down on every keystroke in a Controls field. Keyed on the story's
// parameters object, which is a module-level literal and therefore stable.
const testApps = new WeakMap<object, Wrapper>();

function testAppFor(options: TestAppOptions & object): Wrapper {
  let wrapper = testApps.get(options);
  if (!wrapper) {
    wrapper = createTestAppWrapper(options) as Wrapper;
    testApps.set(options, wrapper);
  }
  return wrapper;
}

function GSTheme({
  themeName,
  children,
}: {
  themeName: 'light' | 'dark';
  children: ReactNode;
}) {
  const theme = useMemo(() => themes[themeName] ?? themes.light, [themeName]);
  return <UnifiedThemeProvider theme={theme}>{children}</UnifiedThemeProvider>;
}

function Providers({
  children,
  themeName,
  initialEntries,
  testAppOptions,
}: {
  children: ReactNode;
  themeName: 'light' | 'dark';
  initialEntries: string[];
  testAppOptions?: TestAppOptions & object;
}) {
  const content = <div style={{ padding: 24 }}>{children}</div>;
  const TestApp = testAppOptions && testAppFor(testAppOptions);
  return (
    <TestApiProvider
      apis={[
        [errorApiRef, errorApi],
        [configApiRef, emptyConfig],
      ]}
    >
      {/* Outermost, and deliberately so: `data-theme-mode` is a stack on
          <body> whose top wins, effects run child-first, and this one runs
          last — so the toolbar's choice survives any theme a test app below
          pushes of its own. */}
      <GSTheme themeName={themeName}>
        {TestApp ? (
          // The app brings a router of its own, so no MemoryRouter here: two
          // nested ones make react-router throw. It also registers a stock
          // Backstage theme, and MUI resolves the *nearest* provider, so the
          // GS theme is applied again inside it.
          <TestApp>
            <GSTheme themeName={themeName}>{content}</GSTheme>
          </TestApp>
        ) : (
          <MemoryRouter initialEntries={initialEntries}>{content}</MemoryRouter>
        )}
      </GSTheme>
    </TestApiProvider>
  );
}

/**
 * Global decorator: wraps every story in the GS theme (switchable from the
 * toolbar) plus the API and router context the shared components expect.
 *
 * A story can seed the router (e.g. to open a URL-driven `DetailsPane`) with:
 *   parameters: { router: { initialEntries: ['/?pane=my-pane&...'] } }
 *
 * A component that resolves a route ref — anything rendering `EntityRefLink`,
 * say — needs a real app around it, which a `MemoryRouter` alone does not
 * provide ("Routing context is not available"). Such a story asks for one, and
 * gets that app's router in place of the plain one:
 *   parameters: { testApp: { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } } }
 * `initialEntries` does not apply to a story that does this; the app owns the
 * router, and `testApp.routeEntries` seeds it instead.
 */
export const withGSProviders: Decorator = (Story, context) => {
  const themeName = context.globals.theme === 'dark' ? 'dark' : 'light';
  const initialEntries = context.parameters?.router?.initialEntries ?? ['/'];
  const testAppOptions = context.parameters?.testApp;
  return (
    <Providers
      themeName={themeName}
      initialEntries={initialEntries}
      testAppOptions={testAppOptions}
    >
      <Story />
    </Providers>
  );
};
