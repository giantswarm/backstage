---
'@giantswarm/backstage-plugin-ui-react': minor
---

`StructuredMetadataList` renders a description list (`dl`/`dt`/`dd`) on bui
`Text` instead of MUI `Typography`, so its keys are no longer `h6` headings.
`SimpleAccordion` and `ConditionsList` take a `headingLevel` prop (default 3)
for the heading bui renders around each trigger.
