---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
---

One tag vocabulary: `TagVocabularyProvider` counts tags across the sources it is given, read only while a `TagsField` is on screen, so suggestions and the "Existing:" hint span agents, skills, connectors and workflows. The sources are `AgentTagSource`, `SkillTagSource` (agent-platform), `ConnectorTagSource` and `WorkflowTagSource` (muster). A tag on an agent's, skill's, connector's or workflow's page links to its Customize tab with the tag picked (`?tags=<tag>`); the pick goes with a switch to another tab. `TagList` takes `getHref`; `SharedTagsProvider`, `tagHref`, `tagsOfSearch` and `withTagsSearch` share a Tags pick between catalogs.
