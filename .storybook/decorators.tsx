import { ComponentType, ReactNode, useLayoutEffect, useMemo } from 'react';
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
import {
  buildPalette,
  buildThemeOptions,
} from '../packages/app/src/modules/app/customThemes';
// The agent-platform shell's stylesheet and document mark, as the app sets
// them. Every rule in the stylesheet is scoped to `html[data-agent-shell]`, so
// it changes nothing until a story asks for the shell's look with
// `parameters: { agentShell: true }`.
import '../packages/app/src/modules/agentShell/agent-shell.css';
import { setAgentShellMark } from '../packages/app/src/modules/agentShell/AgentShellThemeRoot/useAgentShellAttribute';

const emptyConfig = new ConfigReader({});

// Built once: the two production themes. `UnifiedThemeProvider` applies the MUI
// v4 + v5 theme and also sets `data-theme-mode` on <body>, which is what bui
// (@backstage/ui) reads to switch its own light/dark tokens — so a single
// provider themes all three UI layers at once.
// The third is the agent shell's, which is light only: the app builds it
// whenever `data-agent-shell` is set, whatever the person's theme.
const themes = {
  light: createUnifiedTheme({ palette: buildPalette(emptyConfig, 'light') }),
  dark: createUnifiedTheme({ palette: buildPalette(emptyConfig, 'dark') }),
  shell: createUnifiedTheme(buildThemeOptions(emptyConfig, 'light', true)),
};

type ThemeName = keyof typeof themes;

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
  themeName: ThemeName;
  children: ReactNode;
}) {
  const theme = useMemo(() => themes[themeName] ?? themes.light, [themeName]);
  return <UnifiedThemeProvider theme={theme}>{children}</UnifiedThemeProvider>;
}

// How many shell stories are mounted. An autodocs page shows several at once,
// and one of them remounting (a Controls change) must not take the mark from
// the others: the last one out clears it.
let mountedShellStories = 0;

/**
 * Marks the document as the agent shell while the story is shown, through the
 * app's own `setAgentShellMark`, so `agent-shell.css` applies: the shell's
 * colours, font and field boxes.
 */
function AgentShellRoot({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    mountedShellStories += 1;
    setAgentShellMark(true);
    return () => {
      mountedShellStories -= 1;
      if (mountedShellStories === 0) {
        setAgentShellMark(false);
      }
    };
  }, []);
  return <>{children}</>;
}

function Providers({
  children,
  themeName,
  initialEntries,
  testAppOptions,
  agentShell,
}: {
  children: ReactNode;
  themeName: 'light' | 'dark';
  initialEntries: string[];
  testAppOptions?: TestAppOptions & object;
  agentShell: boolean;
}) {
  // The shell is light only, as in the app: the toolbar's dark does not apply.
  const theme: ThemeName = agentShell ? 'shell' : themeName;
  const padded = <div style={{ padding: 24 }}>{children}</div>;
  const content = agentShell ? (
    <AgentShellRoot>{padded}</AgentShellRoot>
  ) : (
    padded
  );
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
      <GSTheme themeName={theme}>
        {TestApp ? (
          // The app brings a router of its own, so no MemoryRouter here: two
          // nested ones make react-router throw. It also registers a stock
          // Backstage theme, and MUI resolves the *nearest* provider, so the
          // GS theme is applied again inside it.
          <TestApp>
            <GSTheme themeName={theme}>{content}</GSTheme>
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
 *
 * A story of a component that lives in the agent-platform shell can render in
 * the shell's look (its colours, font and field boxes) with:
 *   parameters: { agentShell: true }
 * The shell is light only, so such a story ignores the toolbar's theme.
 */
export const withGSProviders: Decorator = (Story, context) => {
  const themeName = context.globals.theme === 'dark' ? 'dark' : 'light';
  const initialEntries = context.parameters?.router?.initialEntries ?? ['/'];
  const testAppOptions = context.parameters?.testApp;
  const agentShell = Boolean(context.parameters?.agentShell);
  return (
    <Providers
      themeName={themeName}
      initialEntries={initialEntries}
      testAppOptions={testAppOptions}
      agentShell={agentShell}
    >
      <Story />
    </Providers>
  );
};
