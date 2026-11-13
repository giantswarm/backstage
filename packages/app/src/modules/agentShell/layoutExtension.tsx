import type { ReactNode } from 'react';
import {
  coreExtensionData,
  createExtension,
  createExtensionInput,
} from '@backstage/frontend-plugin-api';
import { SidebarPage } from '@backstage/core-components';
import {
  DateTimeZoneProvider,
  ShellDocumentTitleProvider,
  ShellScopeProvider,
  type TagSource,
  TagVocabularyProvider,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  AgentTagSource,
  SkillTagSource,
} from '@giantswarm/backstage-plugin-agent-platform';
import {
  ConnectorTagSource,
  WorkflowTagSource,
} from '@giantswarm/backstage-plugin-muster';
import { useAgentShellArea } from './agentArea';
import { RailWidthProvider } from './RailWidthProvider';
import { ShellMain } from './ShellMain';
import { SignedInElsewhereAlert } from './SignedInElsewhereAlert';

/**
 * Every kind of resource with tags. The shell mounts the one vocabulary over
 * them, as only it sees both plugins; they read only while a tags field is on
 * screen.
 */
const TAG_SOURCES: readonly TagSource[] = [
  AgentTagSource,
  SkillTagSource,
  ConnectorTagSource,
  WorkflowTagSource,
];

/**
 * The app's layout, as `@backstage/plugin-app` builds it, with the page
 * content in the shell's main region on the agent area's routes while the
 * Agent Platform is available (`app.portals`, or the person's opt-in flag).
 * Everywhere else — and without the Agent Platform, everywhere — the layout
 * is exactly the upstream one, so the classic portal keeps its chrome (and
 * its UTC dates; the shell's are local). The shell is decided per location at
 * render time; the nav element makes the same choice for the rail vs the
 * classic sidebar. The rail's width, which the person can change, is shared
 * by the rail and the content region beside it (`RailWidthProvider`); off the
 * shell the provider does no work.
 */
function AgentShellLayout({
  nav,
  content,
}: {
  nav: ReactNode;
  content: ReactNode;
}) {
  const shellActive = useAgentShellArea();
  // The shell tells time on the browser's clock, as its lists already do by
  // grouping on the local day; classic pages keep the portal's UTC. Shared
  // components take their shell behavior from the scope (`InfoHint`'s
  // popover, `FactList`'s phone stacking); classic pages keep theirs. Always
  // mounted, so moving between the two does not remount the page.
  return (
    <DateTimeZoneProvider timeZone={shellActive ? 'local' : 'utc'}>
      <ShellScopeProvider inShell={shellActive}>
        <ShellDocumentTitleProvider suffix="Agent Platform">
          <RailWidthProvider active={shellActive}>
            <SidebarPage>
              {nav}
              {shellActive ? (
                <ShellMain>
                  <SignedInElsewhereAlert />
                  <TagVocabularyProvider sources={TAG_SOURCES}>
                    {content}
                  </TagVocabularyProvider>
                </ShellMain>
              ) : (
                content
              )}
            </SidebarPage>
          </RailWidthProvider>
        </ShellDocumentTitleProvider>
      </ShellScopeProvider>
    </DateTimeZoneProvider>
  );
}

export const agentShellLayout = createExtension({
  name: 'layout',
  attachTo: { id: 'app/root', input: 'children' },
  inputs: {
    nav: createExtensionInput([coreExtensionData.reactElement], {
      singleton: true,
    }),
    content: createExtensionInput([coreExtensionData.reactElement], {
      singleton: true,
    }),
  },
  output: [coreExtensionData.reactElement],
  factory: ({ inputs }) => {
    const nav = inputs.nav.get(coreExtensionData.reactElement);
    const content = inputs.content.get(coreExtensionData.reactElement);
    return [
      coreExtensionData.reactElement(
        <AgentShellLayout nav={nav} content={content} />,
      ),
    ];
  },
});
