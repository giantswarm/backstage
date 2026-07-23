---
'@giantswarm/backstage-plugin-flux-react': patch
---

Migrate the Flux details panel to bui (`@backstage/ui`)

- Rebuild the details-panel frame (`Section`, `Details`, and the
  Kustomization/HelmRelease/Repository/ImageAutomation detail components) on bui
  `Flex`/`Box`/`Text`, replacing legacy `@material-ui/core` + `makeStyles`
  layout.
- Migrate the full `ResourceCard` tree (`ResourceCard`/`ResourceWrapper`,
  `ResourceInfo`, `ResourceHeading`, `ResourceStatus`, `ResourceChips`,
  `ResourceMetadata`, `CopyCommandMenu`) to bui. `CopyCommandMenu` now uses the
  bui `MenuTrigger`/`Menu` with a `ButtonIcon` trigger. The card's custom
  theme-aware background colors are intentionally kept in a colocated
  `makeStyles`, as bui has no equivalent token.
- Because `ResourceWrapper` and `ResourceInfo` are also used by the tree-view
  node (`ResourceNode`), the tree view's card appearance is updated to match.
- Resource cards in the details panel are now collapsible bui `Accordion`s
  (expanded by default): the name/kind/status row is the trigger and the
  metadata/actions are the revealable panel. The card keeps its rounded corners
  and status-colored background (including the not-ready tint), the resource name
  is a bold heading, and the expand/collapse caret is aligned to the top-right of
  the header.
- Add render tests for `Details`, `ResourceCard`, and `CopyCommandMenu`.
