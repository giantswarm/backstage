---
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-gs-backend': patch
'@giantswarm/backstage-plugin-ui-react': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

A Tags field the installation does not offer (an older muster or agent-manager) no longer yields a problem, so an edit of a connector with more than 50 stored tags on such a muster no longer bounces from Sign-in back to Connect. Tags under five characters are no longer offered as near-duplicates of each other (`docs`, `dogs`). `TagVocabularyProvider` and `SharedTagsProvider` move to their own component directories; muster's `useConnectorGroupPaths` is now `useConnectorListPaths`, and `useTakesDisplayName`/`useTakesTags` are one `useToolTakesArgument`.

The 50-tag limit is checked as muster checks it (`exceedsTagLimit` in gs-common): a list past 50 is refused only when it holds a tag not already stored, so an unchanged or shortened list of tags written elsewhere goes through, and a create takes at most 50. gs-backend's skill pull request checks it against the SKILL.md's stored `metadata.tags` (a 422) instead of capping every request at 50.
