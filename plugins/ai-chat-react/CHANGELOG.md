# @giantswarm/backstage-plugin-ai-chat-react

## 0.6.0

### Minor Changes

- 464f5ad: Migrate the cluster and deployment pages to a single BUI `PluginHeader`.

  - Replace the classic `<Page>`/`<Header>` (blue banner) on the cluster and
    deployment list and detail pages with the BUI `PluginHeader`, and suppress the
    app-shell header (`noHeader`) so the two headers no longer stack.
  - Detail-page tabs move from the classic `RoutedTabs` strip to BUI tabs rendered
    in the plugin header (via a shared `useLayoutTabs` hook), matching the muster
    and flux sections.
  - Header actions are now BUI buttons: the new `AIChatButtonBui` variant and a
    BUI-converted "Edit deployment" button. The troubleshoot state uses BUI's
    `destructive` styling.
  - The dropped header "type" line and the cluster description subtitle now live in
    the respective "About" cards.

  `ai-chat-react` gains a new exported `AIChatButtonBui` component for use in BUI
  contexts; the existing Material UI `AIChatButton` is unchanged.

- b431a04: Let users ask the AI chat to explain Flux error messages. ai-chat-react exports a new `buildExplainErrorMessage` prompt builder that embeds a resource's failing condition message plus context (kind, name, namespace, cluster, reason, revision). The Flux resource card's "Troubleshoot with AI" button now sends the actual error message instead of asking the AI to look the resource up, and the HelmRelease conditions card on the deployment details page gets an "Explain this error" button on failing conditions. The buttons render nothing on installations without ai-chat enabled.

## 0.5.0

### Minor Changes

- 9cf3777: Add "Configure with AI" button to App Deployment template

## 0.4.3

### Patch Changes

- 3953b15: Add conversation history route.

## 0.4.2

### Patch Changes

- 0af418e: Redesign AI chat layout with PluginHeader, sticky composer, scroll-on-send behavior, and polished UI styling. Decouple sidebar item from page extension toggle and add title link to drawer header.

## 0.4.1

### Patch Changes

- c06f5bf: Replace AI chat floating action button with a sidebar nav item that toggles the chat drawer.

## 0.4.0

### Minor Changes

- d7cd901: Add AI chat drawer with persistent/overlay variants, FAB, and openMode prop.
  - New `aiChatDrawerApiRef` and `AIChatDrawerApi` for controlling the drawer from anywhere in the app
  - `AIChatButton` gains an `openMode` prop (`'drawer' | 'navigate'`); defaults to drawer when the API is available
  - `AiChatDrawer` component with responsive persistent (desktop) and overlay (mobile) variants
  - `AiChatFab` floating action button component registered as an app-root-element
  - Shared `useChatSetup` hook extracted from the chat page for reuse in the drawer

## 0.3.0

### Minor Changes

- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

## 0.2.1

### Patch Changes

- cd72c54: Make AIChatButton conditionally visible based on ai-chat plugin availability using NFS Utility API and route ref.

## 0.2.0

### Minor Changes

- d3fd8a5: Add Inspect/Troubleshoot with AI button
