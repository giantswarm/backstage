---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Tag helpers (`parseTags`, `TAGS_ANNOTATION` and the rest), `TagsField`, `TagVocabularyContext` and the `tagsFacet` catalog facet move to `ui-react`, for every resource with tags.

A resource takes at most 50 tags (`MAX_TAGS`): `TagsField` and the agent, connector and skill forms refuse more with "At most 50 tags."
