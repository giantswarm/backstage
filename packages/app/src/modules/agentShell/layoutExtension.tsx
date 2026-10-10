import type { ReactNode } from 'react';
import {
  coreExtensionData,
  createExtension,
  createExtensionInput,
} from '@backstage/frontend-plugin-api';
import { SidebarPage } from '@backstage/core-components';
import { useAgentShellArea } from './agentArea';
import { ShellMain } from './ShellMain';

/**
 * The app's layout, as `@backstage/plugin-app` builds it, with the page
 * content in the shell's main region on the agent area's routes while the
 * Agent Platform is available (`app.portals`, or the person's opt-in flag).
 * Everywhere else — and without the Agent Platform, everywhere — the layout
 * is exactly the upstream one, so the classic portal keeps its chrome. The shell is decided per location at
 * render time; the nav element makes the same choice for the rail vs the
 * classic sidebar.
 */
function AgentShellLayout({
  nav,
  content,
}: {
  nav: ReactNode;
  content: ReactNode;
}) {
  const shellActive = useAgentShellArea();
  return (
    <SidebarPage>
      {nav}
      {shellActive ? <ShellMain>{content}</ShellMain> : content}
    </SidebarPage>
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
