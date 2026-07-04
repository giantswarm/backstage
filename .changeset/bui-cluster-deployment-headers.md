---
'@giantswarm/backstage-plugin-ai-chat-react': minor
'@giantswarm/backstage-plugin-gs': patch
---

Migrate the cluster and deployment pages to a single BUI `PluginHeader`.

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
