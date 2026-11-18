---
'@giantswarm/backstage-plugin-ui-react': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-gs': patch
---

Set no text below 12px in the muster workflow pages and state badges, and drop the local 12px overrides of `FactsColumn`, `TagList`, `TagsField` and `MarkerBadge`: the app now sets bui's 10px token to 12px everywhere. A problem under the New agent tools selection now shows an error icon beside its text. The 10px that stays uses the app's `--gs-font-size-exception` token. `ui-react/testUtils` adds `applyBuiStylesheets` and `resolvedFontSize` for tests of rendered text sizes.
