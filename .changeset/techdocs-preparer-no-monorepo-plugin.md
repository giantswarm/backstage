---
'@giantswarm/backstage-plugin-techdocs-backend-module-gs': patch
---

Stop listing the `monorepo` plugin in the generated `mkdocs.yaml`. TechDocs 2.x removes plugins outside its allowlist and warned about it on every build; `techdocs-core` registers the monorepo plugin itself.
