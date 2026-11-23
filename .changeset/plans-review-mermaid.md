---
'@giantswarm/backstage-plugin-plans': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

A plan document opened from a pull request (Hive → Plans → a pull request) draws its ` ```mermaid ` blocks as diagrams in the portal's light or dark theme, as the merged plans and Knowledge do; the diagram keeps its comment button and review threads. `mermaidSource` (ui-react) returns a ` ```mermaid ` fence's source from the `pre` node react-markdown hands a component, for renderers with their own components.
