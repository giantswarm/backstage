import {
  coreExtensionData,
  createExtension,
  createExtensionInput,
  featureFlagsApiRef,
} from '@backstage/frontend-plugin-api';
import { SidebarPage } from '@backstage/core-components';
import { AGENT_SHELL_FLAG } from './predicates';
import { ShellMain } from './ShellMain';

/**
 * The app's layout, as `@backstage/plugin-app` builds it, with the page
 * content in the shell's main region while the agent-platform shell is on.
 * The flag is read when the app tree is built, as the shell's other
 * extensions are.
 */
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
  factory: ({ apis, inputs }) => {
    const nav = inputs.nav.get(coreExtensionData.reactElement);
    const content = inputs.content.get(coreExtensionData.reactElement);
    const shell = apis.get(featureFlagsApiRef)?.isActive(AGENT_SHELL_FLAG);
    return [
      coreExtensionData.reactElement(
        <SidebarPage>
          {nav}
          {shell ? <ShellMain>{content}</ShellMain> : content}
        </SidebarPage>,
      ),
    ];
  },
});
