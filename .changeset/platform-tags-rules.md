---
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-gs-backend': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

The tag rule lives in `gs-common` (`TAGS_ANNOTATION`, `MAX_TAG_LENGTH`, `MAX_TAGS`, `TAG_PATTERN`, `isValidTag`, `parseTags`), which `ui-react` re-exports and gs-backend checks skill tags against. A skill edit that changes the tags of a SKILL.md whose `metadata.tags` is not a comma-separated list of tags (a YAML list, or a part like `on call`) is refused with a 422 instead of dropping what the form could not show.
